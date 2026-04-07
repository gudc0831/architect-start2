import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { getThemePreference, updateThemePreference } from "@/use-cases/preference-service";

export async function GET() {
  try {
    const user = await requireUser();
    const preference = await getThemePreference(user.id);
    return NextResponse.json({ data: preference });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { themeId?: unknown };
    const preference = await updateThemePreference(user.id, body.themeId);
    return NextResponse.json({ data: preference });
  } catch (error) {
    return handleRouteError(error);
  }
}
