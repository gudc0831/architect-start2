import type { Route } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthRuntimeConfigErrorMessage, isAuthStubMode } from "@/lib/auth/auth-config";
import { getOptionalUser } from "@/lib/auth/require-user";
import { buildPostLoginUrl, resolveSafeInternalPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readNextPath(searchParams: Record<string, string | string[] | undefined>) {
  const next = searchParams.next;
  return Array.isArray(next) ? next[0] ?? null : next ?? null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const nextPath = resolveSafeInternalPath(readNextPath(resolvedSearchParams));
  const stubMode = isAuthStubMode();
  const configError = getAuthRuntimeConfigErrorMessage();

  if (stubMode || configError) {
    return (
      <main className="login-page">
        <LoginForm mode="disabled" nextPath={nextPath} note={configError} />
      </main>
    );
  }

  const user = await getOptionalUser();

  if (user) {
    redirect(buildPostLoginUrl(nextPath) as Route);
  }

  return (
    <main className="login-page">
      <LoginForm mode="google" nextPath={nextPath} />
    </main>
  );
}
