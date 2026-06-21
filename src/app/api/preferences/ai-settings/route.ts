import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireActiveUser } from "@/lib/auth/active-user";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { getAiSettingsPreference, updateAiSettingsPreference } from "@/use-cases/preference-service";

export async function GET() {
  try {
    const user = await requireActiveUser();
    const preference = await getAiSettingsPreference(user.id);
    return NextResponse.json({ data: preference });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireActiveUser();
    const body = await request.json();
    const preference = await updateAiSettingsPreference(user.id, body);
    return NextResponse.json({ data: preference });
  } catch (error) {
    return handleRouteError(error);
  }
}
