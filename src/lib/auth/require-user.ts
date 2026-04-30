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
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const resolvedProfile =
    profile ??
    (await prisma.profile.create({
      data: {
        id: user.id,
        email: user.email?.trim().toLowerCase() ?? "",
        displayName: displayNameFromSupabaseUser({
          email: user.email,
          userMetadata: user.user_metadata,
        }),
        role: "member",
        accessStatus: "pending",
      },
    }));

  return {
    id: resolvedProfile.id,
    email: resolvedProfile.email,
    displayName: resolvedProfile.displayName,
    name: resolvedProfile.displayName,
    role: resolvedProfile.role as AuthRole,
    accessStatus: resolvedProfile.accessStatus,
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

  if (user.accessStatus !== "active") {
    throw forbidden("Active profile access is required", "PROFILE_ACCESS_NOT_ACTIVE");
  }

  if (user.role !== role) {
    throw forbidden();
  }

  return user;
}

function displayNameFromSupabaseUser(input: { email?: string | null; userMetadata?: Record<string, unknown> | null }) {
  const metadataName = input.userMetadata?.full_name ?? input.userMetadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return input.email?.trim().split("@")[0] || "User";
}
