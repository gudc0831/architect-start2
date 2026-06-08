import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSource(path: string) {
  return readFileSync(resolve(path), "utf8");
}

const adminServiceSource = readSource("src/use-cases/admin/admin-service.ts");
const taskServiceSource = readSource("src/use-cases/task-service.ts");
const projectGuardsSource = readSource("src/lib/auth/project-guards.ts");
const requireUserSource = readSource("src/lib/auth/require-user.ts");
const buildFunctionStart = adminServiceSource.indexOf("async function buildEffectiveTaskCategoriesByField");
assert.notEqual(buildFunctionStart, -1, "buildEffectiveTaskCategoriesByField should exist");

const buildFunctionEnd = adminServiceSource.indexOf("export async function listProjectsForSession", buildFunctionStart);
assert.notEqual(buildFunctionEnd, -1, "buildEffectiveTaskCategoriesByField should stay before listProjectsForSession");

const buildFunctionSource = adminServiceSource.slice(buildFunctionStart, buildFunctionEnd);
assert.match(buildFunctionSource, /adminRepository\.listGlobalTaskCategoryDefinitions\(\)/);
assert.match(buildFunctionSource, /adminRepository\.listProjectTaskCategoryDefinitions\(currentProjectId\)/);
assert.match(buildFunctionSource, /const allDefinitions = \[\.\.\.globalDefinitions, \.\.\.projectDefinitions\]/);
assert.match(buildFunctionSource, /resolveEffectiveTaskCategoryDefinitions\(allDefinitions, fieldKey, currentProjectId\)/);
assert.doesNotMatch(buildFunctionSource, /listGlobalTaskCategoryDefinitions\(fieldKey\)/);
assert.doesNotMatch(buildFunctionSource, /listProjectTaskCategoryDefinitions\(currentProjectId,\s*fieldKey\)/);

const postgresAdminStoreSource = readSource("src/repositories/admin/postgres-store.ts");
assert.match(postgresAdminStoreSource, /async listGlobalTaskCategoryDefinitions\(fieldKey\?: TaskCategoryFieldKey\) \{\s*await ensureGlobalBaseWorkTypes\(\);/);
assert.match(postgresAdminStoreSource, /\.\.\.\(fieldKey \? \{ fieldKey \} : \{\}\)/);

const loadEffectiveStart = taskServiceSource.indexOf("async function loadEffectiveTaskCategories");
assert.notEqual(loadEffectiveStart, -1, "loadEffectiveTaskCategories should exist");
const loadEffectiveEnd = taskServiceSource.indexOf("async function listAllTasks", loadEffectiveStart);
assert.notEqual(loadEffectiveEnd, -1, "loadEffectiveTaskCategories should stay before listAllTasks");
const loadEffectiveSource = taskServiceSource.slice(loadEffectiveStart, loadEffectiveEnd);
assert.match(loadEffectiveSource, /adminRepository\.listGlobalTaskCategoryDefinitions\(\)/);
assert.match(loadEffectiveSource, /adminRepository\.listProjectTaskCategoryDefinitions\(projectId\)/);
assert.match(loadEffectiveSource, /resolveEffectiveTaskCategoryDefinitions\(allDefinitions, "workType", projectId\)/);
assert.match(loadEffectiveSource, /resolveEffectiveTaskCategoryDefinitions\(allDefinitions, "coordinationScope", projectId\)/);
assert.doesNotMatch(loadEffectiveSource, /listEffectiveTaskCategoryDefinitions\(/);
assert.doesNotMatch(loadEffectiveSource, /listEffectiveWorkTypeDefinitions\(/);

const currentProjectAccessStart = projectGuardsSource.indexOf("export async function requireCurrentProjectAccess");
assert.notEqual(currentProjectAccessStart, -1, "requireCurrentProjectAccess should exist");
const currentProjectAccessEnd = projectGuardsSource.indexOf("export async function requireProjectManager", currentProjectAccessStart);
assert.notEqual(currentProjectAccessEnd, -1, "requireCurrentProjectAccess should stay before requireProjectManager");
const currentProjectAccessSource = projectGuardsSource.slice(currentProjectAccessStart, currentProjectAccessEnd);
assert.match(currentProjectAccessSource, /const sessionProjectId = await getProjectSessionProjectId\(\)/);
assert.match(currentProjectAccessSource, /adminRepository\.getProjectAccess\(sessionProjectId, resolvedUser\.id\)/);
assert.match(currentProjectAccessSource, /canReadProject\(\{/);
assert.ok(
  currentProjectAccessSource.indexOf("adminRepository.getProjectAccess") <
    currentProjectAccessSource.indexOf("adminRepository.getProjectSelection"),
  "selected project access should use the one-query fast path before fallback project selection",
);

assert.match(requireUserSource, /supabase\.auth\.getClaims\(\)/);
assert.match(requireUserSource, /supabase\.auth\.getUser\(\)/);
assert.ok(
  requireUserSource.indexOf("supabase.auth.getClaims()") < requireUserSource.indexOf("supabase.auth.getUser()"),
  "requireUser should try verified JWT claims before falling back to getUser",
);

console.log("daily create latency harness: ok");
