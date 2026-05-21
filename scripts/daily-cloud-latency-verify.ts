import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Timing = {
  label: string;
  ms: number;
};
type CategoryBundle = Awaited<ReturnType<typeof import("../src/use-cases/admin/admin-service").listEffectiveTaskCategoriesForProject>>;
type CategoryField = keyof CategoryBundle["byField"];

type Options = {
  mutate: boolean;
  maxReadMs: number;
};

function parseOptions(argv: string[]): Options {
  const maxReadMsValue = readOptionValue(argv, "--max-read-ms");
  const maxReadMs = maxReadMsValue ? Number(maxReadMsValue) : 3000;

  return {
    mutate: argv.includes("--mutate"),
    maxReadMs: Number.isFinite(maxReadMs) && maxReadMs > 0 ? maxReadMs : 3000,
  };
}

function readOptionValue(argv: string[], key: string) {
  const index = argv.indexOf(key);
  if (index >= 0) {
    return argv[index + 1] ?? "";
  }

  const prefix = `${key}=`;
  const match = argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

async function timed<T>(label: string, callback: () => Promise<T>): Promise<{ timing: Timing; value: T }> {
  const startedAt = Date.now();
  const value = await callback();
  return {
    timing: {
      label,
      ms: Date.now() - startedAt,
    },
    value,
  };
}

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

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (process.env.APP_BACKEND_MODE !== "cloud") {
    throw new Error("daily cloud latency verification requires APP_BACKEND_MODE=cloud");
  }

  const [{ prisma }, { listEffectiveTaskCategoriesForProject }, { createTask, listTasks }, { taskRepository }] =
    await Promise.all([
      import("../src/lib/prisma"),
      import("../src/use-cases/admin/admin-service"),
      import("../src/use-cases/task-service"),
      import("../src/repositories"),
    ]);

  const timings: Timing[] = [];
  let createdTaskId: string | null = null;

  try {
    const health = await timed("db select 1", () => prisma.$queryRaw`select 1`);
    timings.push(health.timing);

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

    const categories = await timed("list effective task categories", () => listEffectiveTaskCategoriesForProject(project.id));
    timings.push(categories.timing);

    for (let index = 0; index < 3; index += 1) {
      const tasks = await timed(`list active tasks #${index + 1}`, () => listTasks("active", project));
      timings.push(tasks.timing);
    }

    let mutation: null | { createdTaskVisible: boolean; cleanedUp: boolean } = null;
    if (options.mutate) {
      if (!adminProfile) {
        throw new Error("No active admin profile was found for mutation verification.");
      }

      const marker = `codex-cloud-latency-${Date.now()}`;
      const workType = pickCategoryCode(categories.value, "workType");
      const coordinationScope = pickCategoryCodeOrLegacyText(categories.value, "coordinationScope");
      const requestedBy = pickCategoryCodeOrLegacyText(categories.value, "requestedBy");
      const relatedDisciplines = pickCategoryCodeOrLegacyText(categories.value, "relatedDisciplines");
      const locationRef = pickCategoryCodeOrLegacyText(categories.value, "locationRef");
      const created = await timed("create temporary task", () =>
        createTask(
          {
            dueDate: "2026-05-21",
            workType,
            coordinationScope,
            ownerDiscipline: "",
            requestedBy,
            relatedDisciplines,
            assignee: "",
            assigneeProfileId: null,
            issueTitle: marker,
            reviewedAt: "",
            isDaily: true,
            locationRef,
            calendarLinked: false,
            issueDetailNote: "cloud latency verification; delete after check",
            status: "new",
            decision: "",
            parentTaskId: null,
            parentTaskNumber: undefined,
          },
          adminProfile.id,
          project,
        ),
      );
      timings.push(created.timing);
      createdTaskId = created.value.id;

      const afterCreate = await timed("list active tasks after create", () => listTasks("active", project));
      timings.push(afterCreate.timing);
      const createdTaskVisible = afterCreate.value.some(
        (task) => task.id === createdTaskId && task.issueTitle === marker,
      );

      const taskIdToDelete = createdTaskId;
      const cleanup = await timed("delete temporary task", () => taskRepository.deleteTask(taskIdToDelete!));
      timings.push(cleanup.timing);
      const cleanupCheck = await timed("verify temporary task cleanup", () => taskRepository.findTaskById(taskIdToDelete!));
      timings.push(cleanupCheck.timing);
      const cleanedUp = cleanupCheck.value === null;
      if (cleanedUp) {
        createdTaskId = null;
      }

      mutation = {
        createdTaskVisible,
        cleanedUp,
      };
    }

    const readTimings = timings.filter((timing) => !timing.label.includes("create") && !timing.label.includes("delete"));
    const maxReadMs = Math.max(...readTimings.map((timing) => timing.ms));
    const ok = maxReadMs <= options.maxReadMs && (!mutation || (mutation.createdTaskVisible && mutation.cleanedUp));

    console.log(
      JSON.stringify(
        {
          ok,
          projectId: project.id,
          mutate: options.mutate,
          maxReadMs,
          maxReadMsThreshold: options.maxReadMs,
          timings,
          mutation,
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
