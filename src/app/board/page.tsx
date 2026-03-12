import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function BoardPage() {
  await requirePageUser("/board");
  return <TaskWorkspace mode="board" />;
}
