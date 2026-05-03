"use client";

import { useState } from "react";
import { t } from "@/lib/ui-copy";
import { useAuthState } from "@/providers/auth-provider";

export function NoAccessActions() {
  const { clearUser } = useAuthState();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      clearUser();
      window.location.assign("/login");
    }
  }

  return (
    <div className="empty-state__actions">
      <button className="secondary-button" disabled={pending} onClick={() => void handleSignOut()} type="button">
        {pending ? t("noAccess.signingOut") : t("noAccess.switchAccount")}
      </button>
    </div>
  );
}
