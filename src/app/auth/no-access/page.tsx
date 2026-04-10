import { redirect } from "next/navigation";
import { NoAccessActions } from "@/components/auth/no-access-actions";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { t } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const user = await requirePageUser("/auth/no-access");

  if (user.role === "admin") {
    redirect("/admin");
  }

  return (
    <main className="empty-state">
      <h1>{t("noAccess.title")}</h1>
      <p className="empty-state__meta">{t("noAccess.signedInAs", { email: user.email })}</p>
      <p>{t("noAccess.body")}</p>
      <p>{t("noAccess.help")}</p>
      <NoAccessActions />
    </main>
  );
}
