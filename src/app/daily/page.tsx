import { Suspense } from "react";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { requireWorkspacePageUser } from "@/lib/auth/workspace-entry";
import { t } from "@/lib/ui-copy";

export default async function DailyPage() {
  await requireWorkspacePageUser("/daily");
  return (
    <Suspense fallback={<div className="empty-state"><h3>{t("workspace.loading")}</h3></div>}>
      <TaskWorkspace mode="daily" />
    </Suspense>
  );
}
