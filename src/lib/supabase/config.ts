import { serviceUnavailable } from "@/lib/api/errors";

const supabaseClientEnvKeys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const supabaseAdminEnvKeys = [...supabaseClientEnvKeys, "SUPABASE_SERVICE_ROLE_KEY"] as const;

function getMissingEnv(keys: readonly string[]) {
  return keys.filter((key) => !process.env[key]?.trim());
}

function getSupabasePublicEnv() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  } satisfies Record<(typeof supabaseClientEnvKeys)[number], string>;
}

function formatMissingEnvMessage(missing: readonly string[]) {
  return `Supabase 환경 변수가 필요합니다: ${missing.join(", ")}`;
}

function getSupabaseClientConfig() {
  const env = getSupabasePublicEnv();
  const missing = getMissingSupabaseClientEnv();

  if (missing.length > 0) {
    throw serviceUnavailable(formatMissingEnvMessage(missing), "SUPABASE_ENV_MISSING");
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function getSupabaseAdminConfig() {
  const missing = getMissingSupabaseAdminEnv();

  if (missing.length > 0) {
    throw serviceUnavailable(formatMissingEnvMessage(missing), "SUPABASE_ENV_MISSING");
  }

  return {
    ...getSupabaseClientConfig(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
  };
}

export function getMissingSupabaseClientEnv() {
  const env = getSupabasePublicEnv();
  return supabaseClientEnvKeys.filter((key) => !env[key]);
}

export function getMissingSupabaseAdminEnv() {
  return getMissingEnv(supabaseAdminEnvKeys);
}

export function hasSupabaseClientConfig() {
  return getMissingSupabaseClientEnv().length === 0;
}

export function getSupabaseClientConfigErrorMessage() {
  const missing = getMissingSupabaseClientEnv();
  return missing.length === 0 ? null : formatMissingEnvMessage(missing);
}

export function assertSupabaseUrl() {
  return getSupabaseClientConfig().url;
}

export function assertSupabaseAnonKey() {
  return getSupabaseClientConfig().anonKey;
}

export function assertSupabaseServiceRoleKey() {
  return getSupabaseAdminConfig().serviceRoleKey;
}

export function getSupabaseStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "task-files";
}
