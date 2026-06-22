import { redirect } from "next/navigation";
import type { Route } from "next";
import { AssistantAdminShell } from "@/components/admin/assistant-admin-shell";
import { requirePageUser } from "@/lib/auth/require-page-user";

export const dynamic = "force-dynamic";

export default async function AdminAssistantPage() {
  const user = await requirePageUser("/admin/assistant");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (user.accessStatus === "disabled" || user.role !== "admin") {
    redirect("/auth/no-access" as Route);
  }

  return <AssistantAdminShell />;
}
