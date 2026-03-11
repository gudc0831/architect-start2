import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function TrashPage() {
  await requirePageUser("/trash");
  return <TaskWorkspace mode="trash" />;
}
