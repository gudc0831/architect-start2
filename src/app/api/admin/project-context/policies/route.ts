import { NextResponse } from "next/server";
import { getActiveProjectContextRuleSet, listProjectContextRuleSets, projectContextVersionPinningRules } from "@/domains/project-context/policy";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";

export async function GET() {
  try {
    await requireRole("admin");
    return NextResponse.json({
      data: {
        active: getActiveProjectContextRuleSet(),
        policies: listProjectContextRuleSets(),
        versionPinningRules: [...projectContextVersionPinningRules],
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
