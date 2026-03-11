"use client";

import { FormEvent, useState } from "react";
import { useAuthState } from "@/providers/auth-provider";

type LoginFormProps = {
  disabledReason?: string | null;
  nextPath?: string | null;
};

export function LoginForm({ disabledReason = null, nextPath = null }: LoginFormProps) {
  const { refreshUser } = useAuthState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = Boolean(disabledReason);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isDisabled) {
      setError(disabledReason);
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
      const json = (await response.json()) as { error?: { message?: string } };

      if (!response.ok) {
        setError(json.error?.message ?? "로그인에 실패했습니다.");
        return;
      }

      await refreshUser();
      window.location.assign(nextPath || "/board");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-card" onSubmit={onSubmit}>
      <div className="login-card__header">
        <p className="login-card__eyebrow">Architect Start</p>
        <h1>로그인</h1>
        <p>관리자가 생성한 계정으로만 접근할 수 있습니다.</p>
      </div>

      <label className="login-card__field">
        <span>이메일</span>
        <input
          autoComplete="email"
          disabled={pending || isDisabled}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>

      <label className="login-card__field">
        <span>비밀번호</span>
        <input
          autoComplete="current-password"
          disabled={pending || isDisabled}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>

      {disabledReason ? <p className="login-card__error">{disabledReason}</p> : null}
      {error ? <p className="login-card__error">{error}</p> : null}

      <button className="primary-button login-card__submit" disabled={pending || isDisabled} type="submit">
        {isDisabled ? "설정 필요" : pending ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
