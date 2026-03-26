import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { PrismaClient } from "@prisma/client";
import { initializeApp, getApps } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { buildProjectIssueId } from "../src/domains/task/identifiers";
import { classifyLegacyWorkType } from "../src/lib/task-work-type-write";

loadEnvConfig(process.cwd());

type ImportSource = "auto" | "local" | "firestore";
type ImportStorageName = "supabase-storage" | "local-dev-storage";

type LegacyProject = {
  id?: string;
  name?: string;
};

type LegacyTask = {
  id: string;
  taskNumber?: string | number;
  parentTaskId?: string | null;
  siblingOrder?: number;
  dueDate?: string;
  category?: string;
  requester?: string;
  assignee?: string;
  title?: string;
  createdAt?: string;
  isDaily?: boolean;
  description?: string;
  status?: string;
  progressNote?: string;
  conclusion?: string;
  fileMemo?: string;
  deletedAt?: string | null;
};

type LegacyFile = {
  id?: string;
  taskId?: string;
  fileGroupId?: string;
  originalName?: string;
  mimeType?: string | null;
  sizeBytes?: number;
  storedName?: string;
  storedPath?: string;
  version?: number;
  versionNumber?: number;
  versionLabel?: string;
  createdAt?: string;
  deletedAt?: string | null;
};

type LegacyBundle = {
  source: "local" | "firestore";
  project: LegacyProject;
  tasks: LegacyTask[];
  files: LegacyFile[];
};

type NormalizedTask = {
  legacy: LegacyTask;
  id: string;
  projectId: string;
  taskNumber: number;
  parentTaskId: string | null;
  rootTaskId: string;
  depth: number;
  workType: string;
};

type NormalizedFile = {
  legacy: LegacyFile;
  id: string;
  taskId: string;
  projectId: string;
  fileGroupId: string;
  version: number;
  objectPath: string;
};

async function main() {
  const source = parseImportSource();
  const skipMissingFiles = hasFlag("--skip-missing-files");
  const applyChanges = hasFlag("--apply");
  const dryRun = hasFlag("--dry-run") || !applyChanges;
  const allowNonEmpty = hasFlag("--allow-non-empty");
  const bundle = await loadBundle(source);
  const projectId = stableUuid(`project:${bundle.project.id || `${bundle.source}:${bundle.project.name || "default"}`}`);
  const normalizedTasks = normalizeTasks(bundle, projectId);
  const normalizedFiles = normalizeFiles(bundle, projectId, normalizedTasks);

  const { prisma } = await import("../src/lib/prisma");
  const { backendMode, defaultProjectName, localFileStorePath, localProjectMetaPath, localTaskStorePath, localUploadRoot } = await import("../src/lib/runtime-config");
  const { storageProvider } = await import("../src/storage");
  const normalizedProjectName = normalizeText(bundle.project.name) || defaultProjectName;

  if (backendMode !== "cloud") {
    throw new Error("import:legacy requires APP_BACKEND_MODE=cloud");
  }

  const existingCounts = await getExistingCounts(prisma);
  const hasExistingCloudData = Object.values(existingCounts).some((count) => count > 0);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          source: bundle.source,
          paths: {
            localProjectMetaPath,
            localTaskStorePath,
            localFileStorePath,
          },
          existingCounts,
          requiresAllowNonEmpty: hasExistingCloudData,
          planned: {
            projectId,
            taskCount: normalizedTasks.length,
            fileCount: normalizedFiles.length,
            skipMissingFiles,
          },
        },
        null,
        2,
      ),
    );

    await prisma.$disconnect();
    return;
  }

  if (hasExistingCloudData && !allowNonEmpty) {
    throw new Error("Cloud database already contains data. Re-run with --allow-non-empty only after taking a backup.");
  }

  await prisma.project.upsert({
    where: { id: projectId },
    update: {
      name: normalizeText(bundle.project.name) || defaultProjectName,
    },
    create: {
      id: projectId,
      name: normalizeText(bundle.project.name) || defaultProjectName,
    },
  });

  for (const task of [...normalizedTasks].sort((left, right) => left.depth - right.depth || left.taskNumber - right.taskNumber)) {
    const createdAt = normalizeDateTime(task.legacy.createdAt, new Date().toISOString());

    await prisma.task.upsert({
      where: { id: task.id },
      update: {
        projectId,
        taskNumber: task.taskNumber,
        parentTaskId: task.parentTaskId,
        rootTaskId: task.rootTaskId,
        depth: task.depth,
        siblingOrder: Number.isFinite(task.legacy.siblingOrder) ? Number(task.legacy.siblingOrder) : 0,
        dueDate: normalizeDateOnly(task.legacy.dueDate),
        category: task.workType,
        requester: normalizeText(task.legacy.requester),
        assignee: normalizeText(task.legacy.assignee),
        actionId: task.taskNumber,
        issueId: buildProjectIssueId(normalizedProjectName, task.taskNumber),
        title: normalizeText(task.legacy.title) || "Untitled task",
        createdAt: new Date(createdAt),
        isDaily: Boolean(task.legacy.isDaily),
        description: normalizeText(task.legacy.description),
        status: normalizeTaskStatus(task.legacy.status),
        statusHistory: normalizeText(task.legacy.progressNote),
        conclusion: [normalizeText(task.legacy.conclusion), normalizeText(task.legacy.fileMemo)].filter(Boolean).join("\n\n"),
        deletedAt: normalizeText(task.legacy.deletedAt) ? new Date(String(task.legacy.deletedAt)) : null,
      },
      create: {
        id: task.id,
        projectId,
        taskNumber: task.taskNumber,
        parentTaskId: task.parentTaskId,
        rootTaskId: task.rootTaskId,
        depth: task.depth,
        siblingOrder: Number.isFinite(task.legacy.siblingOrder) ? Number(task.legacy.siblingOrder) : 0,
        dueDate: normalizeDateOnly(task.legacy.dueDate),
        category: task.workType,
        requester: normalizeText(task.legacy.requester),
        assignee: normalizeText(task.legacy.assignee),
        actionId: task.taskNumber,
        issueId: buildProjectIssueId(normalizedProjectName, task.taskNumber),
        title: normalizeText(task.legacy.title) || "Untitled task",
        createdAt: new Date(createdAt),
        isDaily: Boolean(task.legacy.isDaily),
        description: normalizeText(task.legacy.description),
        status: normalizeTaskStatus(task.legacy.status),
        statusHistory: normalizeText(task.legacy.progressNote),
        conclusion: [normalizeText(task.legacy.conclusion), normalizeText(task.legacy.fileMemo)].filter(Boolean).join("\n\n"),
        deletedAt: normalizeText(task.legacy.deletedAt) ? new Date(String(task.legacy.deletedAt)) : null,
      },
    });
  }

  let skippedFiles = 0;

  for (const file of [...normalizedFiles].sort((left, right) => left.version - right.version || normalizeDateTime(left.legacy.createdAt, "").localeCompare(normalizeDateTime(right.legacy.createdAt, "")))) {
    const existing = await prisma.file.findUnique({
      where: { id: file.id },
      select: { id: true },
    });

    let storageBucket = storageProvider.name === "supabase-storage" ? process.env.SUPABASE_STORAGE_BUCKET || "task-files" : "local-dev";
    let sizeBytes = Number(file.legacy.sizeBytes ?? 0);
    let originalName = normalizeText(file.legacy.originalName) || "legacy-file";
    let mimeType = normalizeText(file.legacy.mimeType) || guessMimeType(originalName);

    if (!existing) {
      const upload = await uploadLegacyFile(file, localUploadRoot, storageProvider.name as ImportStorageName, skipMissingFiles);
      if (upload.skipped) {
        skippedFiles += 1;
        continue;
      }

      storageBucket = upload.storageBucket;
      sizeBytes = upload.sizeBytes;
      originalName = upload.originalName;
      mimeType = upload.mimeType;
    }

    await prisma.file.upsert({
      where: { id: file.id },
      update: {
        taskId: file.taskId,
        projectId,
        fileGroupId: file.fileGroupId,
        originalName,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        storageProvider: storageProvider.name,
        storageBucket,
        objectPath: file.objectPath,
        version: file.version,
        deletedAt: normalizeText(file.legacy.deletedAt) ? new Date(String(file.legacy.deletedAt)) : null,
      },
      create: {
        id: file.id,
        taskId: file.taskId,
        projectId,
        fileGroupId: file.fileGroupId,
        originalName,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        storageProvider: storageProvider.name,
        storageBucket,
        objectPath: file.objectPath,
        version: file.version,
        createdAt: new Date(normalizeDateTime(file.legacy.createdAt, new Date().toISOString())),
        deletedAt: normalizeText(file.legacy.deletedAt) ? new Date(String(file.legacy.deletedAt)) : null,
      },
    });
  }

  const validation = await validateImport(prisma, projectId, normalizedTasks, normalizedFiles.length - skippedFiles);

  console.log(
    JSON.stringify(
      {
        ok: validation.ok,
        source: bundle.source,
        paths: {
          localProjectMetaPath,
          localTaskStorePath,
          localFileStorePath,
        },
        imported: {
          projectId,
          taskCount: normalizedTasks.length,
          fileCount: normalizedFiles.length - skippedFiles,
          skippedFiles,
        },
        validation,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();

  if (!validation.ok) {
    process.exitCode = 1;
  }
}

function parseImportSource(): ImportSource {
  const raw = getArg("--source");
  if (!raw || raw === "auto") return "auto";
  if (raw === "local" || raw === "firestore") return raw;
  throw new Error(`Unsupported import source: ${raw}`);
}

function getArg(name: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function loadBundle(source: ImportSource): Promise<LegacyBundle> {
  const { defaultProjectName, localFileStorePath, localProjectMetaPath, localTaskStorePath } = await import("../src/lib/runtime-config");

  if (source === "local" || source === "auto") {
    const hasLocalTasks = await pathExists(localTaskStorePath);
    const hasLocalFiles = await pathExists(localFileStorePath);

    if (source === "local" || hasLocalTasks || hasLocalFiles) {
      return {
        source: "local",
        project: await readJsonFile<LegacyProject>(localProjectMetaPath, { name: defaultProjectName }),
        tasks: await readJsonFile<LegacyTask[]>(localTaskStorePath, []),
        files: await readJsonFile<LegacyFile[]>(localFileStorePath, []),
      };
    }
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("No local source found and Firestore is not configured");
  }

  const app = getApps()[0] ?? initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  const [taskSnapshot, fileSnapshot] = await Promise.all([
    getDocs(collection(db, "tasks")),
    getDocs(collection(db, "files")),
  ]);

  return {
    source: "firestore",
    project: {
      id: projectId,
      name: defaultProjectName,
    },
    tasks: taskSnapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Record<string, unknown>) })) as LegacyTask[],
    files: fileSnapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as Record<string, unknown>) })) as LegacyFile[],
  };
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  if (!(await pathExists(path))) {
    return fallback;
  }

  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function getExistingCounts(prismaClient: PrismaClient) {
  const [profiles, projects, tasks, files, preferences] = await Promise.all([
    prismaClient.profile.count(),
    prismaClient.project.count(),
    prismaClient.task.count(),
    prismaClient.file.count(),
    prismaClient.profilePreference.count(),
  ]);

  return {
    profiles,
    projects,
    tasks,
    files,
    preferences,
  };
}

function normalizeTasks(bundle: LegacyBundle, projectId: string) {
  const tasksByLegacyId = new Map(bundle.tasks.map((task) => [task.id, task]));
  const taskNumberMap = buildTaskNumberMap(bundle.tasks);

  return bundle.tasks.map((task) => {
    const id = stableUuid(`task:${bundle.source}:${task.id}`);
    const parentLegacyId = normalizeText(task.parentTaskId);

    return {
      legacy: task,
      id,
      projectId,
      taskNumber: taskNumberMap.get(task.id) ?? 1,
      parentTaskId: parentLegacyId ? stableUuid(`task:${bundle.source}:${parentLegacyId}`) : null,
      rootTaskId: stableUuid(`task:${bundle.source}:${findRootLegacyTaskId(tasksByLegacyId, task.id)}`),
      depth: countTaskDepth(tasksByLegacyId, task.id),
      workType: normalizeLegacyTaskWorkType(task),
    } satisfies NormalizedTask;
  });
}

function normalizeFiles(bundle: LegacyBundle, projectId: string, tasks: NormalizedTask[]) {
  const taskIds = new Set(tasks.map((task) => task.id));

  return bundle.files
    .filter((file) => Boolean(normalizeText(file.taskId)))
    .map((file) => {
      const legacyFileId = normalizeText(file.id) || `${normalizeText(file.taskId)}:${normalizeText(file.fileGroupId)}:${parseLegacyFileVersion(file)}:${normalizeText(file.originalName)}`;
      const taskId = stableUuid(`task:${bundle.source}:${normalizeText(file.taskId)}`);
      const fileGroupId = stableUuid(`file-group:${bundle.source}:${normalizeText(file.fileGroupId) || legacyFileId}`);
      const version = parseLegacyFileVersion(file);
      const originalName = normalizeText(file.originalName) || "legacy-file";

      return {
        legacy: file,
        id: stableUuid(`file:${bundle.source}:${legacyFileId}`),
        taskId,
        projectId,
        fileGroupId,
        version,
        objectPath: `imports/${projectId}/tasks/${taskId}/${fileGroupId}/v${version}-${safeFilename(originalName)}`,
      } satisfies NormalizedFile;
    })
    .filter((file) => taskIds.has(file.taskId));
}

function buildTaskNumberMap(tasks: LegacyTask[]) {
  const ordered = [...tasks].sort((left, right) => normalizeDateTime(left.createdAt, "").localeCompare(normalizeDateTime(right.createdAt, "")));
  const used = new Set<number>();
  const map = new Map<string, number>();
  const maxExisting = ordered.reduce((max, task) => {
    const parsed = parseLegacyTaskNumber(task.taskNumber);
    return parsed ? Math.max(max, parsed) : max;
  }, 0);
  let next = maxExisting + 1;

  for (const task of ordered) {
    const parsed = parseLegacyTaskNumber(task.taskNumber);
    if (parsed && !used.has(parsed)) {
      used.add(parsed);
      map.set(task.id, parsed);
      continue;
    }

    while (used.has(next)) {
      next += 1;
    }

    used.add(next);
    map.set(task.id, next);
    next += 1;
  }

  return map;
}

function countTaskDepth(tasksByLegacyId: Map<string, LegacyTask>, legacyTaskId: string) {
  let depth = 0;
  let currentTask = tasksByLegacyId.get(legacyTaskId);
  const seen = new Set<string>();

  while (currentTask && normalizeText(currentTask.parentTaskId) && !seen.has(currentTask.id)) {
    seen.add(currentTask.id);
    depth += 1;
    currentTask = tasksByLegacyId.get(normalizeText(currentTask.parentTaskId));
  }

  return Math.max(depth, 0);
}

function findRootLegacyTaskId(tasksByLegacyId: Map<string, LegacyTask>, legacyTaskId: string) {
  let currentTask = tasksByLegacyId.get(legacyTaskId);
  const seen = new Set<string>();

  while (currentTask && normalizeText(currentTask.parentTaskId) && !seen.has(currentTask.id)) {
    seen.add(currentTask.id);
    const next = tasksByLegacyId.get(normalizeText(currentTask.parentTaskId));
    if (!next) {
      break;
    }
    currentTask = next;
  }

  return currentTask?.id || legacyTaskId;
}

function parseLegacyTaskNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = /^#?(\d+)$/.exec(trimmed) ?? /^MIL-(\d+)$/.exec(trimmed);
  return match ? Number(match[1]) : null;
}

function normalizeLegacyTaskWorkType(task: LegacyTask) {
  const decision = classifyLegacyWorkType(task.category);
  if (decision.nextCode) {
    return decision.nextCode;
  }

  throw new Error(`Legacy task ${task.id} has unmappable workType: ${decision.rawValue || "<empty>"}`);
}

function parseLegacyFileVersion(file: LegacyFile) {
  if (typeof file.version === "number" && Number.isInteger(file.version)) {
    return file.version;
  }

  if (typeof file.versionNumber === "number" && Number.isInteger(file.versionNumber)) {
    return file.versionNumber;
  }

  const labelMatch = /^v(\d+)$/i.exec(normalizeText(file.versionLabel));
  return labelMatch ? Number(labelMatch[1]) : 1;
}

async function uploadLegacyFile(
  file: NormalizedFile,
  localUploadRoot: string,
  storageName: ImportStorageName,
  skipMissingFiles: boolean,
) {
  const { storageProvider } = await import("../src/storage");
  const candidates = resolveLocalFileCandidates(file.legacy, localUploadRoot);

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    const buffer = await readFile(candidate);
    const originalName = normalizeText(file.legacy.originalName) || basename(candidate) || "legacy-file";
    const mimeType = normalizeText(file.legacy.mimeType) || guessMimeType(originalName);
    const stored = await storageProvider.upload({
      file: new File([buffer], originalName, { type: mimeType }),
      objectPath: file.objectPath,
      contentType: mimeType,
    });

    return {
      skipped: false,
      storageBucket: stored.storageBucket,
      originalName,
      mimeType,
      sizeBytes: buffer.byteLength,
    };
  }

  if (skipMissingFiles) {
    return {
      skipped: true,
      storageBucket: storageName === "supabase-storage" ? process.env.SUPABASE_STORAGE_BUCKET || "task-files" : "local-dev",
      originalName: normalizeText(file.legacy.originalName) || "legacy-file",
      mimeType: normalizeText(file.legacy.mimeType) || guessMimeType(normalizeText(file.legacy.originalName) || "legacy-file"),
      sizeBytes: Number(file.legacy.sizeBytes ?? 0),
    };
  }

  throw new Error(`Legacy file not found on disk for ${normalizeText(file.legacy.originalName) || file.id}`);
}

function resolveLocalFileCandidates(file: LegacyFile, localUploadRoot: string) {
  const storedPath = normalizeText(file.storedPath);
  const storedName = normalizeText(file.storedName);
  const originalName = normalizeText(file.originalName);
  const candidates = [storedPath, storedName, originalName]
    .filter(Boolean)
    .flatMap((value) => {
      if (isAbsolute(value)) {
        return [value];
      }

      return [value, join(localUploadRoot, value)];
    });

  return Array.from(new Set(candidates));
}

async function validateImport(prismaClient: PrismaClient, projectId: string, tasks: NormalizedTask[], expectedFileCount: number) {
  const [projectCount, taskCount, trashTaskCount, fileCount] = await Promise.all([
    prismaClient.project.count({ where: { id: projectId } }),
    prismaClient.task.count({ where: { projectId } }),
    prismaClient.task.count({ where: { projectId, deletedAt: { not: null } } }),
    prismaClient.file.count({ where: { projectId } }),
  ]);

  const latestVersions = await prismaClient.file.findMany({
    where: { projectId },
    select: { fileGroupId: true, version: true },
  });

  const latestByGroup = latestVersions.reduce<Map<string, number>>((acc, file) => {
    acc.set(file.fileGroupId, Math.max(acc.get(file.fileGroupId) ?? 0, file.version));
    return acc;
  }, new Map<string, number>());

  return {
    ok:
      projectCount === 1 &&
      taskCount === tasks.length &&
      trashTaskCount === tasks.filter((task) => Boolean(task.legacy.deletedAt)).length &&
      fileCount === expectedFileCount &&
      latestByGroup.size >= 0,
    projectCount,
    taskCount,
    trashTaskCount,
    fileCount,
    expectedTaskCount: tasks.length,
    expectedTrashTaskCount: tasks.filter((task) => Boolean(task.legacy.deletedAt)).length,
    expectedFileCount,
  };
}

function stableUuid(seed: string) {
  const hex = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDateOnly(value: unknown) {
  const raw = normalizeText(value);
  return raw ? raw.slice(0, 10) : "";
}

function normalizeDateTime(value: unknown, fallback: string) {
  const raw = normalizeText(value);
  return raw || fallback;
}

function normalizeTaskStatus(value: unknown) {
  if (value === "waiting" || value === "todo" || value === "in_progress" || value === "blocked" || value === "done") {
    return value;
  }

  return "waiting";
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function guessMimeType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".dwg")) return "application/acad";
  if (lower.endsWith(".dxf")) return "image/vnd.dxf";
  return "application/octet-stream";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
