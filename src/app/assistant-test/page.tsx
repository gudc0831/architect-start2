import { requirePageUser } from "@/lib/auth/require-page-user";
import { AssistantTestClient } from "./test-client";

export const dynamic = "force-dynamic";

export default async function AssistantTestPage() {
  await requirePageUser("/assistant-test");
  return <AssistantTestClient />;
}
