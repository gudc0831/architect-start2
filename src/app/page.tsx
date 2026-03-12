import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function HomePage() {
  await requirePageUser("/");
  redirect("/board");
}
