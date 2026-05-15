import type { AuthUser } from "@/domains/auth/types";
import { forbidden } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";

export function canManageKnowledge(user: Pick<AuthUser, "role" | "accessStatus">) {
  // MVP mapping: global admin is both System admin and Knowledge admin.
  // Project manager stays project-scoped and does not receive central knowledge rights.
  return user.accessStatus === "active" && user.role === "admin";
}

export async function requireKnowledgeAdmin() {
  const user = await requireUser();

  if (!canManageKnowledge(user)) {
    throw forbidden("Knowledge admin access is required", "KNOWLEDGE_ADMIN_REQUIRED");
  }

  return user;
}
