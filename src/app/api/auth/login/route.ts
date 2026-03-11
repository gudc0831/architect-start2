import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleRouteError } from "@/lib/api/route-error";
import { badRequest, unauthorized } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      throw badRequest("Invalid email or password", "INVALID_CREDENTIALS");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    const profile = await prisma.profile.findUnique({ where: { id: data.user.id } });
    if (!profile) {
      await supabase.auth.signOut();
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    return NextResponse.json({
      data: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        role: profile.role,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

