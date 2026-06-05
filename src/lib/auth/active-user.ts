import type { AuthUser } from "@/domains/auth/types";
import { forbidden } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";

export async function requireActiveUser(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.accessStatus !== "active") {
    throw forbidden("Active profile access is required", "PROFILE_ACCESS_NOT_ACTIVE");
  }

  return user;
}
