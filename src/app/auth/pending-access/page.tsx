import { redirect } from "next/navigation";
import { NoAccessActions } from "@/components/auth/no-access-actions";
import { requirePageUser } from "@/lib/auth/require-page-user";

export const dynamic = "force-dynamic";

export default async function PendingAccessPage() {
  const user = await requirePageUser("/auth/pending-access");

  if (user.accessStatus === "active") {
    redirect("/auth/post-login");
  }

  return (
    <main className="empty-state">
      <h1>Access request pending</h1>
      <p className="empty-state__meta">Signed in as {user.email}</p>
      <p>Your profile was created, but no project access has been approved yet.</p>
      <p>Use an invitation link or ask a project manager/admin to approve access.</p>
      <NoAccessActions />
    </main>
  );
}
