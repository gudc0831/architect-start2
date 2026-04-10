import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { hasAuthRuntimeConfig, isAuthStubMode } from "@/lib/auth/auth-config";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);

    if (isAuthStubMode() || !hasAuthRuntimeConfig()) {
      return disableAuthResponseCache(new NextResponse(null, { status: 204 }));
    }

    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return disableAuthResponseCache(new NextResponse(null, { status: 204 }));
  } catch (error) {
    return handleRouteError(error);
  }
}
