import { redirect } from "next/navigation";
import type { Route } from "next";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function HomePage() {
  await requirePageUser("/");
  redirect("/auth/post-login" as Route);
}
