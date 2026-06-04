import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { disableAuthResponseCache } from "@/lib/auth/auth-response-cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { acceptProjectInvitation, redirectToInvitationLogin } from "@/use-cases/invitation-service";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const token = requestUrl.searchParams.get("token") ?? "";
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      redirectToInvitationLogin(requestUrl, token);
    }

    await acceptProjectInvitation({
      token,
      supabaseUser: user,
    });

    return disableAuthResponseCache(NextResponse.redirect(new URL("/auth/post-login", requestUrl)));
  } catch (error) {
    return handleRouteError(error);
  }
}
