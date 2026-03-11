import type { AuthRole, AuthUser } from "@/domains/auth/types";
import { forbidden, unauthorized } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getOptionalUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    name: profile.displayName,
    role: profile.role as AuthRole,
  } satisfies AuthUser;
}

export async function requireUser() {
  const user = await getOptionalUser();

  if (!user) {
    throw unauthorized();
  }

  return user;
}

export async function requireRole(role: AuthRole) {
  const user = await requireUser();

  if (user.role !== role) {
    throw forbidden();
  }

  return user;
}
