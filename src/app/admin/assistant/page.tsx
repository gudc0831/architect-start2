import { redirect } from "next/navigation";
import { AssistantAdminShell } from "@/components/admin/assistant-admin-shell";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function AdminAssistantPage() {
  const user = await requirePageUser("/admin/assistant");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access");
  }

  if (user.accessStatus === "disabled" || user.role !== "admin") {
    redirect("/auth/no-access");
  }

  return <AssistantAdminShell />;
}
