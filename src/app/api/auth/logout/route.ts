import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { isAuthStubMode } from "@/lib/auth/auth-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    if (isAuthStubMode()) {
      return new NextResponse(null, { status: 204 });
    }

    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
