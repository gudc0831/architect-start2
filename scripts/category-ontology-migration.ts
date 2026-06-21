import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  isTaskCategoryFieldKey,
  requireStoredTaskCategoryCode,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { prisma } from "@/lib/prisma";
import { parseStoredTaskCategoryValues, serializeTaskCategoryValues } from "@/lib/task-category-values";

type MappingEntry = {
  fieldKey: TaskCategoryFieldKey;
  projectId: string;
  fromCode: string;
  toCode: string;
};

type DefinitionRow = {
  id: string;
  fieldKey: string;
  projectId: string | null;
  code: string;
  labelKo: string;
  labelEn: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
};

type LegacyDefinition = DefinitionRow & {
  fieldKey: TaskCategoryFieldKey;
  projectId: string;
};

type MigrationArgs = {
  apply: boolean;
  mappingPath: string | null;
};

type LegacyReportEntry = {
  definitionId: string;
  fieldKey: TaskCategoryFieldKey;
  projectId: string;
  fromCode: string;
  toCode: string | null;
  labelKo: string;
  affectedTasks: number;
  action: "needs_mapping" | "map_to_existing_override" | "convert_to_override";
};

const definitionSelect = {
  id: true,
  fieldKey: true,
  projectId: true,
  code: true,
  labelKo: true,
  labelEn: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.WorkTypeDefinitionSelect;

function usage() {
  return [
    "Usage:",
    "  npx tsx scripts/category-ontology-migration.ts [--dry-run] [--mapping path/to/mapping.json]",
    "  npx tsx scripts/category-ontology-migration.ts --apply --mapping path/to/mapping.json",
    "",
    "Mapping JSON:",
    '  [{ "fieldKey": "coordinationScope", "projectId": "<uuid>", "fromCode": "legacy", "toCode": "global-code" }]',
  ].join("\n");
}

function parseArgs(argv: readonly string[]): MigrationArgs {
  let apply = false;
  let explicitDryRun = false;
  let mappingPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--dry-run") {
      explicitDryRun = true;
      continue;
    }

    if (arg === "--mapping") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`--mapping requires a file path.\n${usage()}`);
      }
      mappingPath = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }

  if (apply && explicitDryRun) {
    throw new Error("--apply and --dry-run cannot be used together.");
  }

  return { apply, mappingPath };
}

function normalizeMappingEntry(raw: unknown, index: number): MappingEntry {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Mapping entry ${index} must be an object.`);
  }

  const candidate = raw as Partial<Record<keyof MappingEntry, unknown>>;
  if (!isTaskCategoryFieldKey(candidate.fieldKey)) {
    throw new Error(`Mapping entry ${index} has invalid fieldKey.`);
  }

  const projectId = typeof candidate.projectId === "string" ? candidate.projectId.trim() : "";
  if (!projectId) {
    throw new Error(`Mapping entry ${index} has invalid projectId.`);
  }

  return {
    fieldKey: candidate.fieldKey,
    projectId,
    fromCode: requireStoredTaskCategoryCode(candidate.fromCode, `mapping[${index}].fromCode`),
    toCode: requireStoredTaskCategoryCode(candidate.toCode, `mapping[${index}].toCode`),
  };
}

async function loadMapping(mappingPath: string | null) {
  if (!mappingPath) {
    return [] as MappingEntry[];
  }

  const absolutePath = path.resolve(process.cwd(), mappingPath);
  const parsed = JSON.parse(await readFile(absolutePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Mapping file must contain a JSON array.");
  }

  const entries = parsed.map((entry, index) => normalizeMappingEntry(entry, index));
  const seen = new Set<string>();

  for (const entry of entries) {
    const key = mappingKey(entry.projectId, entry.fieldKey, entry.fromCode);
    if (seen.has(key)) {
      throw new Error(`Duplicate mapping for ${key}.`);
    }
    seen.add(key);
  }

  return entries;
}

function definitionKey(fieldKey: TaskCategoryFieldKey, code: string) {
  return `${fieldKey}:${code}`;
}

function projectDefinitionKey(projectId: string, fieldKey: TaskCategoryFieldKey, code: string) {
  return `${projectId}:${fieldKey}:${code}`;
}

function mappingKey(projectId: string, fieldKey: TaskCategoryFieldKey, fromCode: string) {
  return projectDefinitionKey(projectId, fieldKey, fromCode);
}

function isValidProjectDefinition(definition: DefinitionRow): definition is LegacyDefinition {
  return Boolean(definition.projectId) && isTaskCategoryFieldKey(definition.fieldKey);
}

function hasCode(values: string, code: string) {
  return parseStoredTaskCategoryValues(values).includes(code);
}

function replaceMultiValue(values: string, fromCode: string, toCode: string) {
  const nextValues = parseStoredTaskCategoryValues(values).map((value) => (value === fromCode ? toCode : value));
  return serializeTaskCategoryValues(nextValues);
}

async function countAffectedTasks(client: Prisma.TransactionClient | typeof prisma, mapping: MappingEntry) {
  switch (mapping.fieldKey) {
    case "workType":
      return client.task.count({ where: { projectId: mapping.projectId, category: mapping.fromCode } });
    case "coordinationScope":
      return client.task.count({ where: { projectId: mapping.projectId, coordinationScope: mapping.fromCode } });
    case "requestedBy":
      return client.task.count({ where: { projectId: mapping.projectId, requester: mapping.fromCode } });
    case "relatedDisciplines": {
      const tasks = await client.task.findMany({
        where: { projectId: mapping.projectId },
        select: { relatedDisciplines: true },
      });
      return tasks.filter((task) => hasCode(task.relatedDisciplines, mapping.fromCode)).length;
    }
    case "locationRef": {
      const tasks = await client.task.findMany({
        where: { projectId: mapping.projectId },
        select: { locationRef: true },
      });
      return tasks.filter((task) => hasCode(task.locationRef, mapping.fromCode)).length;
    }
  }
}

async function applyTaskMapping(tx: Prisma.TransactionClient, mapping: MappingEntry) {
  switch (mapping.fieldKey) {
    case "workType":
      return tx.task.updateMany({
        where: { projectId: mapping.projectId, category: mapping.fromCode },
        data: { category: mapping.toCode, version: { increment: 1 } },
      });
    case "coordinationScope":
      return tx.task.updateMany({
        where: { projectId: mapping.projectId, coordinationScope: mapping.fromCode },
        data: { coordinationScope: mapping.toCode, version: { increment: 1 } },
      });
    case "requestedBy":
      return tx.task.updateMany({
        where: { projectId: mapping.projectId, requester: mapping.fromCode },
        data: { requester: mapping.toCode, version: { increment: 1 } },
      });
    case "relatedDisciplines": {
      const tasks = await tx.task.findMany({
        where: { projectId: mapping.projectId },
        select: { id: true, relatedDisciplines: true },
      });
      let count = 0;

      for (const task of tasks) {
        const nextValue = replaceMultiValue(task.relatedDisciplines, mapping.fromCode, mapping.toCode);
        if (nextValue === task.relatedDisciplines) {
          continue;
        }

        await tx.task.update({
          where: { id: task.id },
          data: { relatedDisciplines: nextValue, version: { increment: 1 } },
        });
        count += 1;
      }

      return { count };
    }
    case "locationRef": {
      const tasks = await tx.task.findMany({
        where: { projectId: mapping.projectId },
        select: { id: true, locationRef: true },
      });
      let count = 0;

      for (const task of tasks) {
        const nextValue = replaceMultiValue(task.locationRef, mapping.fromCode, mapping.toCode);
        if (nextValue === task.locationRef) {
          continue;
        }

        await tx.task.update({
          where: { id: task.id },
          data: { locationRef: nextValue, version: { increment: 1 } },
        });
        count += 1;
      }

      return { count };
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mappings = await loadMapping(args.mappingPath);
  const allDefinitions = await prisma.workTypeDefinition.findMany({
    select: definitionSelect,
    orderBy: [{ fieldKey: "asc" }, { projectId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const globalDefinitions = allDefinitions.filter(
    (definition): definition is DefinitionRow & { fieldKey: TaskCategoryFieldKey; projectId: null } =>
      definition.projectId === null && isTaskCategoryFieldKey(definition.fieldKey),
  );
  const globalCodes = new Set(globalDefinitions.map((definition) => definitionKey(definition.fieldKey, definition.code)));
  const globalDefinitionIds = new Map(globalDefinitions.map((definition) => [definitionKey(definition.fieldKey, definition.code), definition.id]));
  const projectDefinitions = allDefinitions.filter((definition) => definition.projectId !== null);
  const invalidProjectDefinitions = projectDefinitions.filter((definition) => !isTaskCategoryFieldKey(definition.fieldKey));
  const legacyDefinitions = projectDefinitions
    .filter(isValidProjectDefinition)
    .filter((definition) => !globalCodes.has(definitionKey(definition.fieldKey, definition.code)));
  const projectOverrideKeys = new Set(
    projectDefinitions
      .filter(isValidProjectDefinition)
      .map((definition) => projectDefinitionKey(definition.projectId, definition.fieldKey, definition.code)),
  );
  const mappingByKey = new Map(mappings.map((mapping) => [mappingKey(mapping.projectId, mapping.fieldKey, mapping.fromCode), mapping]));

  for (const mapping of mappings) {
    const targetGlobalKey = definitionKey(mapping.fieldKey, mapping.toCode);
    if (!globalDefinitionIds.has(targetGlobalKey)) {
      throw new Error(`Mapping target ${targetGlobalKey} does not exist as a global definition.`);
    }
  }

  const reportEntries = await Promise.all(
    legacyDefinitions.map(async (definition): Promise<LegacyReportEntry> => {
      const mapping = mappingByKey.get(mappingKey(definition.projectId, definition.fieldKey, definition.code));
      const affectedTasks = mapping ? await countAffectedTasks(prisma, mapping) : 0;
      const targetOverrideExists = mapping
        ? projectOverrideKeys.has(projectDefinitionKey(mapping.projectId, mapping.fieldKey, mapping.toCode))
        : false;

      return {
        definitionId: definition.id,
        fieldKey: definition.fieldKey,
        projectId: definition.projectId,
        fromCode: definition.code,
        toCode: mapping?.toCode ?? null,
        labelKo: definition.labelKo,
        affectedTasks,
        action: mapping ? (targetOverrideExists ? "map_to_existing_override" : "convert_to_override") : "needs_mapping",
      };
    }),
  );
  const unmapped = reportEntries.filter((entry) => !entry.toCode);

  if (args.apply) {
    if (!args.mappingPath && legacyDefinitions.length > 0) {
      throw new Error("--apply requires --mapping when legacy project definitions exist.");
    }

    if (invalidProjectDefinitions.length > 0) {
      throw new Error(`Cannot apply while ${invalidProjectDefinitions.length} project definitions have invalid fieldKey values.`);
    }

    if (unmapped.length > 0) {
      throw new Error(`Cannot apply while ${unmapped.length} legacy project definitions are unmapped.`);
    }

    await prisma.$transaction(async (tx) => {
      for (const definition of legacyDefinitions) {
        const mapping = mappingByKey.get(mappingKey(definition.projectId, definition.fieldKey, definition.code));
        if (!mapping) {
          continue;
        }

        await applyTaskMapping(tx, mapping);

        const existingOverride = await tx.workTypeDefinition.findFirst({
          where: {
            projectId: mapping.projectId,
            fieldKey: mapping.fieldKey,
            code: mapping.toCode,
          },
        });

        if (existingOverride) {
          await tx.workTypeDefinition.delete({ where: { id: definition.id } });
          continue;
        }

        await tx.workTypeDefinition.update({
          where: { id: definition.id },
          data: { code: mapping.toCode },
        });
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply" : "dry-run",
        mappingPath: args.mappingPath,
        globalDefinitionCount: globalDefinitions.length,
        projectDefinitionCount: projectDefinitions.length,
        invalidProjectDefinitionCount: invalidProjectDefinitions.length,
        legacyDefinitionCount: legacyDefinitions.length,
        mappedLegacyDefinitionCount: reportEntries.filter((entry) => entry.toCode).length,
        unmappedLegacyDefinitionCount: unmapped.length,
        entries: reportEntries,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
