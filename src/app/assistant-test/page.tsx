import { requirePageUser } from "@/lib/auth/require-page-user";
import { AssistantTestClient } from "./test-client";

export default async function AssistantTestPage() {
  await requirePageUser("/assistant-test");
  return <AssistantTestClient />;
}
