import { redirect } from "next/navigation";
import type { Route } from "next";
import { KnowledgeAdminShell } from "@/components/admin/knowledge-admin-shell";
import { parseKnowledgeAdminNavigation } from "@/components/admin/knowledge-admin-tabs";
import { canManageKnowledge } from "@/lib/auth/knowledge-guards";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listKnowledgeCandidates } from "@/use-cases/admin/knowledge-service";

type AdminKnowledgePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminKnowledgePage({ searchParams }: AdminKnowledgePageProps) {
  const user = await requirePageUser("/admin/knowledge");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (!canManageKnowledge(user)) {
    redirect("/auth/no-access" as Route);
  }

  const rawSearchParams = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }

  const candidates = await listKnowledgeCandidates();
  return (
    <KnowledgeAdminShell
      initialCandidates={candidates}
      initialNavigation={parseKnowledgeAdminNavigation(params)}
    />
  );
}
