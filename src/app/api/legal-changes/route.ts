import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { taskRepository } from "@/repositories";
import { listLegalChangeItems } from "@/use-cases/legal-change-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireKnowledgeAdmin();
    const context = await requireCurrentProjectAccess(user);
    const tasks = await taskRepository.listActiveTasks(context.project.id);
    const data = await listLegalChangeItems({
      visibleTaskIds: tasks.map((task) => task.id),
    });

    return NextResponse.json({ data }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
