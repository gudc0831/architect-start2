import { redirect } from "next/navigation";
import type { Route } from "next";
import { KnowledgeAdminShell } from "@/components/admin/knowledge-admin-shell";
import { canManageKnowledge } from "@/lib/auth/knowledge-guards";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listKnowledgeCandidates } from "@/use-cases/admin/knowledge-service";

export default async function AdminKnowledgePage() {
  const user = await requirePageUser("/admin/knowledge");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (!canManageKnowledge(user)) {
    redirect("/auth/no-access" as Route);
  }

  const candidates = await listKnowledgeCandidates();
  return <KnowledgeAdminShell initialCandidates={candidates} />;
}
