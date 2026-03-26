import { dirname, join, resolve } from "node:path";

export {
  assertBackendModeConfig,
  backendMode,
  getBackendModeConfigErrorMessage,
  getMissingCloudBackendEnv,
  getMissingFirebaseClientEnv,
  hasCloudBackendConfig,
  hasFirebaseBackendConfig,
  isFirestoreEnabled,
  isPostgresPrimary,
  type BackendMode,
} from "@/lib/backend-mode";

function normalizeFsPath(path: string) {
  return resolve(path);
}

export const localDataRoot = normalizeFsPath(process.env.LOCAL_DATA_ROOT || "D:/architect-start-data");
export const localUploadRoot = normalizeFsPath(process.env.LOCAL_UPLOAD_ROOT || join(localDataRoot, "uploads"));
export const localProjectMetaPath = normalizeFsPath(
  process.env.LOCAL_PROJECT_META_PATH || join(localDataRoot, "project", "project-meta.json"),
);
export const localProjectMetaDir = dirname(localProjectMetaPath);
export const localTaskStorePath = join(localDataRoot, "data", "tasks.json");
export const localFileStorePath = join(localDataRoot, "data", "files.json");
export const localSequenceStorePath = join(localDataRoot, "data", "task-sequence.json");
export const localPreferenceStorePath = join(localDataRoot, "settings", "profile-preferences.json");
export const localAdminStorePath = join(localDataRoot, "settings", "admin-foundation.json");

export const defaultProjectName = process.env.DEFAULT_PROJECT_NAME?.trim() || "Architect Start";
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET || "task-files";
export const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 10 * 1024 * 1024);
export const allowedUploadExtensions = (process.env.ALLOWED_UPLOAD_EXTENSIONS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
