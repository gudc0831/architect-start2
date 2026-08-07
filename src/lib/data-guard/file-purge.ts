import { randomUUID } from "node:crypto";
import {
  normalizeFileMetadata,
  type FileMetadata,
  type FilePurgeObject,
  type FilePurgeState,
} from "@/domains/file/analysis";

type DurableFilePurgeInput = {
  file: { metadata: FileMetadata | unknown };
  objects: FilePurgeObject[];
  persistPendingMetadata: (metadata: FileMetadata) => Promise<void>;
  completePurge: (metadata: FileMetadata, purgedAt: string) => Promise<void>;
  deleteObject: (object: FilePurgeObject) => Promise<void>;
  now?: () => string;
};

export function filePurgeObjectKey(object: FilePurgeObject) {
  return `${object.storageBucket}:${object.objectPath}`;
}

export async function runDurableFilePurge(input: DurableFilePurgeInput) {
  if (input.objects.length === 0) {
    throw new Error("Refusing to purge a file without an owned storage object.");
  }

  const now = input.now ?? (() => new Date().toISOString());
  const normalizedMetadata = normalizeFileMetadata(input.file.metadata);
  const authoritativeObjects = deduplicateObjects(input.objects);
  const authoritativeKeys = authoritativeObjects.map(filePurgeObjectKey);
  const previous = normalizedMetadata.purge;
  const canResume =
    previous &&
    previous.state !== "completed" &&
    equalStringSets(
      previous.objects.map(filePurgeObjectKey),
      authoritativeKeys,
    );
  const requestedAt = canResume ? previous.requestedAt : now();
  const operationId = canResume ? previous.operationId : randomUUID();
  const deletedObjectKeys = canResume
    ? previous.deletedObjectKeys.filter((key) => authoritativeKeys.includes(key))
    : [];
  const attemptStartedAt = now();
  let purgeState: FilePurgeState = {
    operationId,
    state: "pending",
    objects: authoritativeObjects,
    deletedObjectKeys,
    attemptCount: (canResume ? previous.attemptCount : 0) + 1,
    requestedAt,
    updatedAt: attemptStartedAt,
    lastError: null,
  };
  let metadata: FileMetadata = {
    ...normalizedMetadata,
    purge: purgeState,
  };

  // Durable intent is persisted before the first irreversible object deletion.
  await input.persistPendingMetadata(metadata);

  for (const object of authoritativeObjects) {
    const key = filePurgeObjectKey(object);
    if (purgeState.deletedObjectKeys.includes(key)) {
      continue;
    }

    try {
      await input.deleteObject(object);
    } catch (error) {
      purgeState = {
        ...purgeState,
        state: "retryable",
        updatedAt: now(),
        lastError: describeError(error),
      };
      metadata = {
        ...metadata,
        purge: purgeState,
      };
      try {
        await input.persistPendingMetadata(metadata);
      } catch (persistError) {
        throw new AggregateError(
          [error, persistError],
          "File object deletion failed and retry state could not be persisted.",
        );
      }
      throw error;
    }

    purgeState = {
      ...purgeState,
      deletedObjectKeys: [...purgeState.deletedObjectKeys, key],
      updatedAt: now(),
    };
    metadata = {
      ...metadata,
      purge: purgeState,
    };
    // If this write fails, retrying the already deleted object must be idempotent.
    await input.persistPendingMetadata(metadata);
  }

  const purgedAt = now();
  metadata = {
    ...metadata,
    purge: {
      ...purgeState,
      state: "completed",
      updatedAt: purgedAt,
      lastError: null,
    },
  };
  await input.completePurge(metadata, purgedAt);

  return {
    metadata,
    purgedAt,
  };
}

function deduplicateObjects(objects: FilePurgeObject[]) {
  return [
    ...new Map(
      objects.map((object) => [
        filePurgeObjectKey(object),
        {
          storageBucket: object.storageBucket,
          objectPath: object.objectPath,
        },
      ]),
    ).values(),
  ];
}

function equalStringSets(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function describeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
