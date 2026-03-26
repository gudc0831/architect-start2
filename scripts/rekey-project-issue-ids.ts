import process from "node:process";
import { getProject, updateProject } from "@/use-cases/project-service";

async function main() {
  const project = await getProject();
  const updated = await updateProject(project.name, process.env.REKEY_UPDATED_BY?.trim() || null);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId: updated.id,
        projectName: updated.name,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
