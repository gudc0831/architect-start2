import { Suspense } from "react";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { t } from "@/lib/ui-copy";

export default function PreviewTrashPage() {
  return (
    <Suspense fallback={<div className="empty-state"><h3>{t("workspace.previewLoading")}</h3></div>}>
      <TaskWorkspace mode="trash" />
    </Suspense>
  );
}
