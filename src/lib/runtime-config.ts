import { dirname, join } from "node:path";

export const isFirestoreEnabled =
  Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
  process.env.FIRESTORE_USE_MEMORY_FALLBACK !== "true";

export const localDataRoot = process.env.LOCAL_DATA_ROOT || "D:/architect-start-data";
export const localUploadRoot = process.env.LOCAL_UPLOAD_ROOT || join(localDataRoot, "uploads");
export const localProjectMetaPath = process.env.LOCAL_PROJECT_META_PATH || join(localDataRoot, "project", "project-meta.json");
export const localProjectMetaDir = dirname(localProjectMetaPath);
export const localTaskStorePath = join(localDataRoot, "data", "tasks.json");
export const localFileStorePath = join(localDataRoot, "data", "files.json");
export const localSequenceStorePath = join(localDataRoot, "data", "task-sequence.json");