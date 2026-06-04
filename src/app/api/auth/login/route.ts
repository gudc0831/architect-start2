import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { badRequest, notFound, serviceUnavailable, unauthorized } from "@/lib/api/errors";
import {
  getAuthRuntimeConfigErrorMessage,
  getDisabledPasswordLoginMessage,
  hasAuthRuntimeConfig,
  isAuthStubMode,
  isTransitionalPasswordLoginEnabled,
} from "@/lib/auth/auth-config";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const credentials = readPasswordCredentials(await request.json());

    if (isAuthStubMode()) {
      throw serviceUnavailable("Authentication uses stub mode outside the cloud backend.", "AUTH_NOT_CONFIGURED");
    }

    if (!hasAuthRuntimeConfig()) {
      throw serviceUnavailable(
        getAuthRuntimeConfigErrorMessage() ?? "Cloud backend configuration is incomplete.",
        "CLOUD_ENV_MISSING",
      );
    }

    if (!isTransitionalPasswordLoginEnabled()) {
      throw notFound(getDisabledPasswordLoginMessage(), "PASSWORD_LOGIN_DISABLED");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(credentials);

    if (error || !data.user) {
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
    if (!profile) {
      await supabase.auth.signOut();
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    return disableAuthResponseCache(
      NextResponse.json({
        data: {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          role: profile.role,
        },
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function readPasswordCredentials(body: unknown) {
  if (!isRecord(body)) {
    throw badRequest("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    throw badRequest("Invalid email or password", "INVALID_CREDENTIALS");
  }

  return { email, password };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
