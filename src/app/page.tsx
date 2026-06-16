import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { resolvePostLoginDestination } from "@/lib/auth/workspace-entry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requirePageUser("/");
  const { destination } = await resolvePostLoginDestination(user, null);
  redirect(destination as Parameters<typeof redirect>[0]);
}
