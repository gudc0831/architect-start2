import { createRequire } from "node:module";
import type { AuthRole, AuthUser } from "@/domains/auth/types";
import { forbidden, serviceUnavailable, unauthorized } from "@/lib/api/errors";
import {
  assertSafeAuthRuntime,
  getAuthFallbackUser,
  getAuthRuntimeConfigErrorMessage,
  hasAuthRuntimeConfig,
  isAuthStubMode,
  isUnsafeNonCloudProductionMode,
} from "@/lib/auth/auth-config";

const require = createRequire(import.meta.url);

function loadCloudAuthDeps() {
  return {
    prisma: require("../prisma").prisma as typeof import("../prisma").prisma,
    createSupabaseServerClient: require("../supabase/server").createSupabaseServerClient as typeof import("../supabase/server").createSupabaseServerClient,
  };
}

export async function getOptionalUser(): Promise<AuthUser | null> {
  if (isAuthStubMode()) {
    return getAuthFallbackUser();
  }

  if (!hasAuthRuntimeConfig()) {
    if (isUnsafeNonCloudProductionMode()) {
      return null;
    }

    throw serviceUnavailable(
      getAuthRuntimeConfigErrorMessage() ?? "Cloud backend configuration is incomplete.",
      "CLOUD_ENV_MISSING",
    );
  }

  const { prisma, createSupabaseServerClient } = loadCloudAuthDeps();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    name: profile.displayName,
    role: profile.role as AuthRole,
  } satisfies AuthUser;
}

export async function requireUser() {
  assertSafeAuthRuntime();
  const user = await getOptionalUser();

  if (!user) {
    throw unauthorized();
  }

  return user;
}

export async function requireRole(role: AuthRole) {
  const user = await requireUser();

  if (user.role !== role) {
    throw forbidden();
  }

  return user;
}
