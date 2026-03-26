import { redirect } from "next/navigation";
import { AdminFoundationShell } from "@/components/admin/admin-foundation-shell";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function AdminPage() {
  const user = await requirePageUser("/admin");

  if (user.role !== "admin") {
    redirect("/board");
  }

  return <AdminFoundationShell />;
}
