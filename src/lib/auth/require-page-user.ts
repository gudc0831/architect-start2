import { redirect } from "next/navigation";
import type { AuthUser } from "@/domains/auth/types";
import { getOptionalUser } from "@/lib/auth/require-user";

function buildLoginRedirect(pathname: string, reason?: string) {
  const searchParams = new URLSearchParams();

  if (pathname && pathname !== "/") {
    searchParams.set("next", pathname);
  }

  if (reason) {
    searchParams.set("reason", reason);
  }

  const query = searchParams.toString();
  return query ? `/login?${query}` : "/login";
}

function redirectToLogin(pathname: string, reason?: string): never {
  redirect(buildLoginRedirect(pathname, reason) as Parameters<typeof redirect>[0]);
}

export async function requirePageUser(pathname: string): Promise<AuthUser> {
  const user = await getOptionalUser();

  if (!user) {
    redirectToLogin(pathname);
  }

  return user;
}
