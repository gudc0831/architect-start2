import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function CalendarPage() {
  await requirePageUser("/calendar");
  return <TaskWorkspace mode="calendar" />;
}
