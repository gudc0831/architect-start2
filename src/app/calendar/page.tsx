import { Suspense } from "react";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { t } from "@/lib/ui-copy";
import { requirePageUser } from "@/lib/auth/require-page-user";

export default async function CalendarPage() {
  await requirePageUser("/calendar");
  return (
    <Suspense fallback={<div className="empty-state"><h3>{t("workspace.loading")}</h3></div>}>
      <TaskWorkspace mode="calendar" />
    </Suspense>
  );
}
