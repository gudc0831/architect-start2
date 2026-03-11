import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function DailyPage() {
  await requirePageUser("/daily");
  return <TaskWorkspace mode="daily" />;
}
