import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getSupabaseStorageBucket } from "@/lib/supabase/config";
import { appendAuditEvent } from "@/lib/data-guard/shared";
import type { StorageProvider, StoredObject } from "@/storage/contracts";

async function appendStorageDeleteAuditEvent(input: {
  storageBucket: string;
  objectPath: string;
  metadata: Record<string, unknown> | null;
}) {
  try {
    await appendAuditEvent({
      action: "storage.object.delete.requested",
      storageProvider: "supabase-storage",
      storageBucket: input.storageBucket,
      objectPath: input.objectPath,
      metadata: input.metadata,
      restoreLimitation: "Supabase Storage object deletes remove the object body. Cloud JSON backups keep bucket/path metadata only and cannot reconstruct object bytes.",
    });
  } catch {
    // Best effort only: the audit trail should not turn a requested storage delete into an undeletable object.
  }
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase-storage";

  async upload(input: {
    file: File;
    objectPath: string;
    contentType?: string | null;
  }): Promise<StoredObject> {
    const supabase = createSupabaseAdminClient();
    const bucket = getSupabaseStorageBucket();
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const { error } = await supabase.storage.from(bucket).upload(input.objectPath, buffer, {
      contentType: input.contentType ?? undefined,
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      storageProvider: this.name,
      storageBucket: bucket,
      objectPath: input.objectPath,
    };
  }

  async delete(input: { storageBucket: string; objectPath: string }): Promise<void> {
    const supabase = createSupabaseAdminClient();
    const { data: metadata } = await supabase.storage.from(input.storageBucket).info(input.objectPath);

    await appendStorageDeleteAuditEvent({
      storageBucket: input.storageBucket,
      objectPath: input.objectPath,
      metadata: metadata
        ? {
            id: metadata.id ?? null,
            name: metadata.name ?? null,
            size: metadata.size ?? null,
            contentType: metadata.contentType ?? null,
            createdAt: metadata.createdAt ?? null,
            updatedAt: metadata.updatedAt ?? null,
          }
        : null,
    });

    const { error } = await supabase.storage.from(input.storageBucket).remove([input.objectPath]);

    if (error) {
      throw new Error(error.message);
    }
  }

  async download(input: { storageBucket: string; objectPath: string }): Promise<Uint8Array> {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(input.storageBucket).download(input.objectPath);

    if (error) {
      throw new Error(error.message);
    }

    return new Uint8Array(await data.arrayBuffer());
  }

  async getObjectMetadata(input: { storageBucket: string; objectPath: string }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(input.storageBucket).info(input.objectPath);

    if (error || !data) {
      return null;
    }

    return {
      sizeBytes: typeof data.size === "number" ? data.size : 0,
      mimeType: data.contentType ?? null,
    };
  }

  async createSignedDownloadUrl(input: {
    storageBucket: string;
    objectPath: string;
    expiresInSeconds?: number;
  }) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(input.storageBucket)
      .createSignedUrl(input.objectPath, input.expiresInSeconds ?? 60 * 10);

    if (error) {
      return null;
    }

    return data.signedUrl;
  }
}
