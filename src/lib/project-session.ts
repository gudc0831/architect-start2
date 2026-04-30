import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const projectSessionCookieName = "architect-start.current-project-id";

export async function getProjectSessionProjectId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(projectSessionCookieName)?.value?.trim() ?? "";
  return value || null;
}

export function applyProjectSessionProjectId(response: NextResponse, projectId: string | null) {
  if (projectId) {
    response.cookies.set(projectSessionCookieName, projectId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  response.cookies.delete(projectSessionCookieName);
  return response;
}
