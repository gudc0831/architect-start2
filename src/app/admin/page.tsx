import { redirect } from "next/navigation";
import type { Route } from "next";
import { AdminFoundationShell } from "@/components/admin/admin-foundation-shell";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { listProjectsForSession } from "@/use-cases/admin/admin-service";

export default async function AdminPage() {
  const user = await requirePageUser("/admin");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (user.accessStatus === "disabled") {
    redirect("/auth/no-access" as Route);
  }

  if (user.role !== "admin") {
    const selection = await listProjectsForSession(user);
    if (selection.currentProjectRole !== "manager") {
      redirect("/auth/no-access" as Route);
    }
  }

  return <AdminFoundationShell />;
}
