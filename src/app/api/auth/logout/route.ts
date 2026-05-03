import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { hasAuthRuntimeConfig, isAuthStubMode } from "@/lib/auth/auth-config";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const response = new NextResponse(null, { status: 204 });

    if (isAuthStubMode() || !hasAuthRuntimeConfig()) {
      return disableAuthResponseCache(response);
    }

    const supabase = await createSupabaseServerClient({ response });
    await supabase.auth.signOut();
    return disableAuthResponseCache(response);
  } catch (error) {
    return handleRouteError(error);
  }
}
