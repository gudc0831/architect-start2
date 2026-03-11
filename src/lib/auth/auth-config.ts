const authRuntimeEnvKeys = ["DATABASE_URL"] as const;

import { getMissingSupabaseClientEnv } from "@/lib/supabase/config";

function getMissingEnv(keys: readonly string[]) {
  return keys.filter((key) => !process.env[key]?.trim());
}

function formatMissingEnvMessage(missing: readonly string[]) {
  return `필수 환경 변수가 없습니다: ${missing.join(", ")}`;
}

export function getMissingAuthRuntimeEnv() {
  return [...new Set([...getMissingSupabaseClientEnv(), ...getMissingEnv(authRuntimeEnvKeys)])];
}

export function hasAuthRuntimeConfig() {
  return getMissingAuthRuntimeEnv().length === 0;
}

export function getAuthRuntimeConfigErrorMessage() {
  const missing = getMissingAuthRuntimeEnv();
  return missing.length === 0 ? null : formatMissingEnvMessage(missing);
}
