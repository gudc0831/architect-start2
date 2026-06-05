import { redirect } from "next/navigation";
import type { Route } from "next";
import { AiSettingsClient } from "@/components/ai-settings/ai-settings-client";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { labelForRole } from "@/lib/ui-copy";

export default async function AiSettingsPage() {
  const user = await requirePageUser("/ai-settings");

  if (user.accessStatus === "pending") {
    redirect("/auth/pending-access" as Route);
  }

  if (user.accessStatus === "disabled") {
    redirect("/auth/no-access" as Route);
  }

  return (
    <AiSettingsClient
      user={{
        displayName: user.displayName,
        email: user.email,
        role: labelForRole(user.role),
      }}
    />
  );
}
