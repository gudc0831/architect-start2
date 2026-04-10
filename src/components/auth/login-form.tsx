"use client";

import { useState } from "react";
import { buildGoogleLoginUrl, resolveSafeInternalPath } from "@/lib/auth/safe-next-path";
import { t } from "@/lib/ui-copy";

type LoginFormProps = {
  mode?: "google" | "disabled";
  nextPath?: string | null;
  note?: string | null;
};

export function LoginForm({
  mode = "google",
  nextPath = null,
  note = null,
}: LoginFormProps) {
  const safeNextPath = resolveSafeInternalPath(nextPath);
  const [pending, setPending] = useState(false);
  const disabled = mode === "disabled";

  function onContinueWithGoogle() {
    if (disabled) {
      return;
    }

    setPending(true);
    window.location.assign(buildGoogleLoginUrl(safeNextPath));
  }

  return (
    <section className="login-card" aria-live="polite">
      <div className="login-card__header">
        <p className="login-card__eyebrow">{t("brand.appName")}</p>
        <h1>{t("login.title")}</h1>
        <p>{disabled ? t("login.subtitle") : t("login.googleSubtitle")}</p>
      </div>

      <p className="login-card__note">{disabled ? note ?? t("login.stubNote") : t("login.googleNote")}</p>

      <button className="primary-button login-card__submit" disabled={pending || disabled} onClick={onContinueWithGoogle} type="button">
        {disabled ? t("actions.authNotConnected") : pending ? t("actions.signingIn") : t("actions.continueWithGoogle")}
      </button>
    </section>
  );
}
