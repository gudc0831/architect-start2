import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { getThemePreference, updateThemePreference } from "@/use-cases/preference-service";
import type { ThemePreference } from "@/domains/preferences/types";

const themePreferenceCookieName = "architect-start.theme-id";
const themePreferenceCookieMaxAge = 60 * 60 * 24 * 365;

function themePreferenceResponse(preference: ThemePreference) {
  const response = NextResponse.json({ data: preference });
  response.cookies.set(themePreferenceCookieName, preference.themeId, {
    maxAge: themePreferenceCookieMaxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function GET() {
  try {
    const user = await requireUser();
    const preference = await getThemePreference(user.id);
    return themePreferenceResponse(preference);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = (await request.json()) as { themeId?: unknown };
    const preference = await updateThemePreference(user.id, body.themeId);
    return themePreferenceResponse(preference);
  } catch (error) {
    return handleRouteError(error);
  }
}
