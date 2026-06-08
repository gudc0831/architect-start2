import { loadEnvConfig } from "@next/env";
import * as Y from "yjs";

loadEnvConfig(process.cwd());

type CategoryBundle = Awaited<ReturnType<typeof import("../src/use-cases/admin/admin-service").listEffectiveTaskCategoriesForProject>>;
type CategoryField = keyof CategoryBundle["byField"];

function pickCategoryCode(categories: CategoryBundle, field: CategoryField) {
  const code = categories.byField[field].definitions[0]?.code;
  if (!code) {
    throw new Error(`No active category definition found for ${field}.`);
  }

  return code;
}

function pickCategoryCodeOrLegacyText(categories: CategoryBundle, field: Exclude<CategoryField, "workType">) {
  return categories.byField[field].definitions[0]?.code ?? `legacy-${field}`;
}

function buildYTextReplaceUpdate(input: { yStateBase64: string | null; plainText: string; nextText: string }) {
  const doc = new Y.Doc();
  if (input.yStateBase64) {
    Y.applyUpdate(doc, Buffer.from(input.yStateBase64, "base64"));
  } else {
    doc.getText("value").insert(0, input.plainText);
  }

  const text = doc.getText("value");
  const before = Y.encodeStateVector(doc);
  doc.transact(() => {
    text.delete(0, text.length);
    if (input.nextText) {
      text.insert(0, input.nextText);
    }
  });

  return Buffer.from(Y.encodeStateAsUpdate(doc, before)).toString("base64");
}

async function main() {
  if (process.env.APP_BACKEND_MODE !== "cloud") {
    throw new Error("daily cell collaboration cloud verification requires APP_BACKEND_MODE=cloud");
  }

  const [{ prisma }, { listEffectiveTaskCategoriesForProject }, { createTask }, { taskRepository }, { applyTaskCellDocumentUpdate, getTaskCellDocument }] =
    await Promise.all([
      import("../src/lib/prisma"),
      import("../src/use-cases/admin/admin-service"),
      import("../src/use-cases/task-service"),
      import("../src/repositories"),
      import("../src/use-cases/task-cell-document-service"),
    ]);

  let createdTaskId: string | null = null;
  const marker = `codex-cell-doc-${Date.now()}`;
  const mergedText = `${marker} merged`;
  const clientUpdateId = `${marker}-client-update`;

  try {
    const [project, adminProfile] = await Promise.all([
      prisma.project.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      }),
      prisma.profile.findFirst({
        where: {
          role: "admin",
          accessStatus: "active",
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    ]);

    if (!project) {
      throw new Error("No cloud project was found.");
    }
    if (!adminProfile) {
      throw new Error("No active admin profile was found for cell document verification.");
    }

    const categories = await listEffectiveTaskCategoriesForProject(project.id);
    const created = await createTask(
      {
        dueDate: "2026-05-21",
        workType: pickCategoryCode(categories, "workType"),
        coordinationScope: pickCategoryCodeOrLegacyText(categories, "coordinationScope"),
        ownerDiscipline: "",
        requestedBy: pickCategoryCodeOrLegacyText(categories, "requestedBy"),
        relatedDisciplines: pickCategoryCodeOrLegacyText(categories, "relatedDisciplines"),
        assignee: "",
        assigneeProfileId: null,
        issueTitle: marker,
        reviewedAt: "",
        isDaily: true,
        locationRef: pickCategoryCodeOrLegacyText(categories, "locationRef"),
        calendarLinked: false,
        issueDetailNote: "cell document cloud verification; delete after check",
        status: "new",
        decision: "",
        parentTaskId: null,
        parentTaskNumber: undefined,
      },
      adminProfile.id,
      project,
    );
    createdTaskId = created.id;

    const initial = await getTaskCellDocument({
      projectId: project.id,
      taskId: createdTaskId,
      fieldKey: "issueTitle",
    });
    const updateBase64 = buildYTextReplaceUpdate({
      yStateBase64: initial.yStateBase64,
      plainText: initial.plainText,
      nextText: mergedText,
    });

    const first = await applyTaskCellDocumentUpdate({
      projectId: project.id,
      taskId: createdTaskId,
      fieldKey: "issueTitle",
      actorProfileId: adminProfile.id,
      clientUpdateId,
      updateBase64,
    });

    const duplicate = await applyTaskCellDocumentUpdate({
      projectId: project.id,
      taskId: createdTaskId,
      fieldKey: "issueTitle",
      actorProfileId: adminProfile.id,
      clientUpdateId,
      updateBase64,
    });

    const [snapshot, task, updateCount] = await Promise.all([
      getTaskCellDocument({
        projectId: project.id,
        taskId: createdTaskId,
        fieldKey: "issueTitle",
      }),
      prisma.task.findFirst({
        where: {
          id: createdTaskId,
          projectId: project.id,
        },
        select: {
          title: true,
        },
      }),
      prisma.taskCellUpdate.count({
        where: {
          cellDocumentId: first.id,
          clientUpdateId,
        },
      }),
    ]);

    const cleanedTaskId = createdTaskId;
    await taskRepository.deleteTask(cleanedTaskId);
    createdTaskId = null;
    const cleanupCheck = await taskRepository.findTaskById(cleanedTaskId);

    const ok =
      first.plainText === mergedText &&
      duplicate.version === first.version &&
      snapshot.plainText === mergedText &&
      task?.title === mergedText &&
      updateCount === 1 &&
      cleanupCheck === null;

    console.log(
      JSON.stringify(
        {
          ok,
          projectId: project.id,
          fieldKey: "issueTitle",
          firstVersion: first.version,
          duplicateVersion: duplicate.version,
          projectionMatched: task?.title === mergedText,
          duplicateUpdateCount: updateCount,
          cleanedUp: cleanupCheck === null,
        },
        null,
        2,
      ),
    );

    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    if (createdTaskId) {
      await taskRepository.deleteTask(createdTaskId).catch(() => undefined);
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
