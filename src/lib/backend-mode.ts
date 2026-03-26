import { serviceUnavailable } from "@/lib/api/errors";

const backendModes = ["local", "firestore", "cloud"] as const;
const firebaseClientEnvKeys = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;
const cloudBackendEnvKeys = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type BackendMode = (typeof backendModes)[number];

function getMissingEnv(keys: readonly string[]) {
  return keys.filter((key) => !process.env[key]?.trim());
}

function formatBackendModeMessage(mode: Exclude<BackendMode, "local">, missing: readonly string[]) {
  const label = mode === "firestore" ? "Firestore" : "Cloud backend";
  return `${label} configuration is incomplete: ${missing.join(", ")}`;
}

function resolveBackendMode(): BackendMode {
  const rawMode = process.env.APP_BACKEND_MODE?.trim() || "local";

  if ((backendModes as readonly string[]).includes(rawMode)) {
    return rawMode as BackendMode;
  }

  throw serviceUnavailable(
    `APP_BACKEND_MODE must be one of: ${backendModes.join(", ")}. Received: ${rawMode}`,
    "BACKEND_MODE_INVALID",
  );
}

export const backendMode = resolveBackendMode();
export const isFirestoreEnabled = backendMode === "firestore";
export const isPostgresPrimary = backendMode === "cloud";

export function getMissingFirebaseClientEnv() {
  return getMissingEnv(firebaseClientEnvKeys);
}

export function getMissingCloudBackendEnv() {
  return getMissingEnv(cloudBackendEnvKeys);
}

export function hasFirebaseBackendConfig() {
  return getMissingFirebaseClientEnv().length === 0;
}

export function hasCloudBackendConfig() {
  return getMissingCloudBackendEnv().length === 0;
}

export function getBackendModeConfigErrorMessage(mode: BackendMode = backendMode) {
  if (mode === "local") {
    return null;
  }

  const missing = mode === "firestore" ? getMissingFirebaseClientEnv() : getMissingCloudBackendEnv();
  return missing.length === 0 ? null : formatBackendModeMessage(mode, missing);
}

export function assertBackendModeConfig(mode: BackendMode = backendMode) {
  const message = getBackendModeConfigErrorMessage(mode);

  if (!message) {
    return;
  }

  throw serviceUnavailable(message, mode === "firestore" ? "FIREBASE_ENV_MISSING" : "CLOUD_ENV_MISSING");
}
