import { redirect } from "next/navigation";
import { KnowledgeAdminShell } from "@/components/admin/knowledge-admin-shell";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listKnowledgeCandidates } from "@/use-cases/admin/knowledge-service";

export default async function AdminKnowledgePage() {
  const user = await requirePageUser("/admin/knowledge");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access");
  }

  if (user.accessStatus === "disabled" || user.role !== "admin") {
    redirect("/auth/no-access");
  }

  const candidates = await listKnowledgeCandidates();
  return <KnowledgeAdminShell initialCandidates={candidates} />;
}
