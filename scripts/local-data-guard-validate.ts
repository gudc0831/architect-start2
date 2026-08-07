import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "architect-local-guard-"));
  process.env.APP_BACKEND_MODE = "local";
  process.env.DATA_GUARD_MODE = "warn";
  process.env.LOCAL_DATA_ROOT = root;
  process.env.LOCAL_UPLOAD_ROOT = join(root, "uploads");

  const taskPath = join(root, "data", "tasks.json");
  const uploadPath = join(root, "uploads", "projects", "p1", "tasks", "t1", "source.txt");
  await mkdir(join(root, "project"), { recursive: true });
  await mkdir(join(root, "data"), { recursive: true });
  await mkdir(join(root, "settings"), { recursive: true });
  await mkdir(join(uploadPath, ".."), { recursive: true });
  await writeFile(
    join(root, "project", "project-meta.json"),
    `${JSON.stringify({ id: "p1", name: "Guard Test" })}\n`,
    "utf8",
  );
  await writeFile(taskPath, `${JSON.stringify([{ id: "before" }])}\n`, "utf8");
  await writeFile(join(root, "data", "files.json"), "[]\n", "utf8");
  await writeFile(uploadPath, "before\n", "utf8");

  try {
    const { createLocalSnapshot, restoreLocalSnapshot } = await import("../src/lib/data-guard/local");
    const snapshot = await createLocalSnapshot("validator");
    assert.equal(snapshot.uploads.exists, true);
    assert.equal(snapshot.uploads.fileCount, 1);
    assert.equal(snapshot.manifestVersion, 2);
    assert.match(snapshot.stores.find((store) => store.store === "tasks")?.sha256 ?? "", /^[a-f0-9]{64}$/);

    await writeFile(taskPath, `${JSON.stringify([{ id: "after" }])}\n`, "utf8");
    await writeFile(uploadPath, "after\n", "utf8");
    const restored = await restoreLocalSnapshot(snapshot.id);

    assert.ok(restored.preRestoreSnapshotId.startsWith("local-"));
    assert.deepEqual(JSON.parse(await readFile(taskPath, "utf8")), [{ id: "before" }]);
    assert.equal(await readFile(uploadPath, "utf8"), "before\n");
    await assert.rejects(() => restoreLocalSnapshot("../outside"), /Snapshot id is invalid/);

    await writeFile(join(root, "project", "project-meta.json"), `${JSON.stringify({ id: "p1", name: "Rollback Current" })}\n`, "utf8");
    await writeFile(taskPath, `${JSON.stringify([{ id: "rollback-current" }])}\n`, "utf8");
    await writeFile(uploadPath, "rollback-current\n", "utf8");
    await assert.rejects(
      () => restoreLocalSnapshot(snapshot.id, { testFailureAfterSwapCount: 1 }),
      /Simulated restore swap failure/,
    );
    assert.equal(
      (JSON.parse(await readFile(join(root, "project", "project-meta.json"), "utf8")) as { name: string }).name,
      "Rollback Current",
    );
    assert.deepEqual(JSON.parse(await readFile(taskPath, "utf8")), [{ id: "rollback-current" }]);
    assert.equal(await readFile(uploadPath, "utf8"), "rollback-current\n");

    const missingArtifactSnapshot = await createLocalSnapshot("validator-missing-artifact");
    const missingArtifactDir = join(root, "data-guard", "local-snapshots", missingArtifactSnapshot.id);
    await rm(join(missingArtifactDir, "tasks.json"));
    await writeFile(taskPath, `${JSON.stringify([{ id: "must-survive-missing" }])}\n`, "utf8");
    await assert.rejects(
      () => restoreLocalSnapshot(missingArtifactSnapshot.id),
      /required store artifact is missing/,
    );
    assert.deepEqual(JSON.parse(await readFile(taskPath, "utf8")), [{ id: "must-survive-missing" }]);

    const damagedArtifactSnapshot = await createLocalSnapshot("validator-damaged-artifact");
    const damagedArtifactDir = join(root, "data-guard", "local-snapshots", damagedArtifactSnapshot.id);
    await writeFile(join(damagedArtifactDir, "tasks.json"), "[{\"id\":\"tampered\"}]\n", "utf8");
    await writeFile(taskPath, `${JSON.stringify([{ id: "must-survive-damage" }])}\n`, "utf8");
    await assert.rejects(
      () => restoreLocalSnapshot(damagedArtifactSnapshot.id),
      /checksum failed/,
    );
    assert.deepEqual(JSON.parse(await readFile(taskPath, "utf8")), [{ id: "must-survive-damage" }]);

    await rm(taskPath);
    await rm(join(root, "uploads"), { recursive: true, force: true });
    const emptySnapshot = await createLocalSnapshot("validator-empty-state");
    assert.equal(emptySnapshot.stores.find((store) => store.store === "tasks")?.exists, false);
    assert.equal(emptySnapshot.uploads.exists, false);
    await writeFile(taskPath, `${JSON.stringify([{ id: "must-be-removed" }])}\n`, "utf8");
    await mkdir(join(uploadPath, ".."), { recursive: true });
    await writeFile(uploadPath, "must-be-removed\n", "utf8");
    await restoreLocalSnapshot(emptySnapshot.id);
    await assert.rejects(() => readFile(taskPath, "utf8"), /ENOENT/);
    await assert.rejects(() => readFile(uploadPath, "utf8"), /ENOENT/);

    await writeFile(taskPath, "[]\n", "utf8");
    const { memoryTaskRepository } = await import("../src/repositories/memory/store");
    const createInput = {
      projectId: "p1",
      projectName: "Guard Test",
      dueDate: "",
      workType: "",
      coordinationScope: "",
      ownerDiscipline: "",
      requestedBy: "",
      relatedDisciplines: "",
      assignee: "",
      issueTitle: "Concurrent task",
      isDaily: true,
      locationRef: "",
      calendarLinked: false,
      issueDetailNote: "",
      status: "new" as const,
      decision: "",
    };
    const clientMutationId = randomUUID();
    const [first, second] = await Promise.all([
      memoryTaskRepository.createTask({ ...createInput, id: clientMutationId }),
      memoryTaskRepository.createTask({ ...createInput, id: randomUUID() }),
    ]);
    assert.notEqual(first.taskNumber, second.taskNumber);
    await assert.rejects(
      () =>
        memoryTaskRepository.createTask({
          ...createInput,
          id: clientMutationId,
          projectId: "p2",
          projectName: "Other Project",
        }),
      /another project/,
    );
    const [firstUpdate, staleUpdate] = await Promise.all([
      memoryTaskRepository.updateTaskWithVersion(first.id, {
        expectedVersion: first.version,
        issueTitle: "First update",
      }),
      memoryTaskRepository.updateTaskWithVersion(first.id, {
        expectedVersion: first.version,
        issueTitle: "Stale update",
      }),
    ]);
    assert.ok(firstUpdate);
    assert.equal(staleUpdate, null);

    console.log(
      `local-data-guard-validate-pass snapshot=${snapshot.id} preRestore=${restored.preRestoreSnapshotId}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
