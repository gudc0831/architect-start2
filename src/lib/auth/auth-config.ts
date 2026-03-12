import type { AuthUser } from "@/domains/auth/types";
import { getMissingSupabaseClientEnv } from "@/lib/supabase/config";

const authRuntimeEnvKeys = ["DATABASE_URL"] as const;
// Keep a stable local identity so the app can run before Supabase auth is wired.
const authFallbackUser: AuthUser = {
  id: "local-auth-placeholder",
  email: "local@architect.start",
  displayName: "Local Admin",
  name: "Local Admin",
  role: "admin",
};

function getMissingEnv(keys: readonly string[]) {
  return keys.filter((key) => !process.env[key]?.trim());
}

function formatMissingEnvMessage(missing: readonly string[]) {
  return `Required auth environment is missing: ${missing.join(", ")}`;
}

export function getMissingAuthRuntimeEnv() {
  return [...new Set([...getMissingSupabaseClientEnv(), ...getMissingEnv(authRuntimeEnvKeys)])];
}

export function hasAuthRuntimeConfig() {
  return getMissingAuthRuntimeEnv().length === 0;
}

// Stub mode keeps login UI visible while letting the rest of the app stay usable locally.
export function isAuthStubMode() {
  return !hasAuthRuntimeConfig();
}

export function getAuthRuntimeConfigErrorMessage() {
  const missing = getMissingAuthRuntimeEnv();
  return missing.length === 0 ? null : formatMissingEnvMessage(missing);
}

export function getAuthFallbackUser() {
  return authFallbackUser;
}
