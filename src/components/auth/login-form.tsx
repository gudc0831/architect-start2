"use client";

import { FormEvent, useState } from "react";
import { localizeError, t } from "@/lib/ui-copy";
import { useAuthState } from "@/providers/auth-provider";

type LoginFormProps = {
  disabled?: boolean;
  nextPath?: string | null;
  note?: string | null;
};

export function LoginForm({ disabled = false, nextPath = null, note = null }: LoginFormProps) {
  const { refreshUser } = useAuthState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) {
      setError(localizeError({ code: "AUTH_NOT_CONFIGURED", fallbackKey: "authNotConfigured" }));
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await response.json()) as { error?: { code?: string; message?: string } };

      if (!response.ok) {
        setError(localizeError({ code: json.error?.code, fallbackKey: "loginFailed" }));
        return;
      }

      await refreshUser();
      window.location.assign(nextPath || "/board");
    } catch {
      setError(localizeError({ fallbackKey: "loginFailed" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <div className="login-card__header">
        <p className="login-card__eyebrow">{t("brand.appName")}</p>
        <h1>{t("login.title")}</h1>
        <p>{t("login.subtitle")}</p>
      </div>

      {disabled ? <p className="login-card__note">{note ?? t("login.stubNote")}</p> : null}

      <label className="login-card__field">
        <span>{t("login.email")}</span>
        <input
          autoComplete="email"
          disabled={pending || disabled}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>

      <label className="login-card__field">
        <span>{t("login.password")}</span>
        <input
          autoComplete="current-password"
          disabled={pending || disabled}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>

      {error ? <p className="login-card__error">{error}</p> : null}

      <button className="primary-button login-card__submit" disabled={pending || disabled} type="submit">
        {disabled ? t("actions.authNotConnected") : pending ? t("actions.signingIn") : t("actions.login")}
      </button>
    </form>
  );
}
