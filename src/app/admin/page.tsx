import { redirect } from "next/navigation";
import { AdminFoundationShell } from "@/components/admin/admin-foundation-shell";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listProjectsForSession } from "@/use-cases/admin/admin-service";

export default async function AdminPage() {
  const user = await requirePageUser("/admin");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access");
  }

  if (user.accessStatus === "disabled") {
    redirect("/auth/no-access");
  }

  const selection = await listProjectsForSession(user);
  if (user.role !== "admin" && selection.availableProjects.length === 0) {
    redirect("/auth/no-access");
  }

  return <AdminFoundationShell />;
}
