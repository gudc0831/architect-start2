import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function readObjectType(source: string, name: string) {
  const prefix = `export type ${name} =`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} type missing`);
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, `${name} type end missing`);
  return source.slice(start, end + "\n};".length);
}

function readPrismaModel(source: string, name: string) {
  const prefix = `model ${name} {`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} model missing`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `${name} model end missing`);
  return source.slice(start, end + "\n}".length);
}

function normalizeTypeDefinition(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/202606240001_add_project_wiki/migration.sql");
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

assert.match(schema, /model ProjectWikiItem\s+\{/);
assert.match(schema, /model ProjectWikiActionLog\s+\{/);
const assistantTaskRecordModel = readPrismaModel(schema, "AssistantTaskRecord");
const assistantWorkSummaryDraftModel = readPrismaModel(schema, "AssistantWorkSummaryDraft");
const projectWikiItemModel = readPrismaModel(schema, "ProjectWikiItem");
const projectWikiActionLogModel = readPrismaModel(schema, "ProjectWikiActionLog");
assert.match(schema, /reviewDeletedAt\s+DateTime\?/);
assert.match(schema, /sourceReviewRecordId\s+String\s+@unique/);
assert.match(schema, /commonCandidateRecordId\s+String\?\s+@unique/);
assert.match(schema, /@@index\(\[projectId, status, updatedAt\]\)/);
assert.match(assistantTaskRecordModel, /@@unique\(\[projectId, id\]\)/);
assert.match(assistantWorkSummaryDraftModel, /@@unique\(\[projectId, id\]\)/);
assert.match(
  projectWikiItemModel,
  /sourceReviewRecord\s+AssistantTaskRecord\s+@relation\("ProjectWikiSourceReviewRecord", fields: \[projectId, sourceReviewRecordId\], references: \[projectId, id\], onDelete: Restrict\)/,
);
assert.match(
  projectWikiItemModel,
  /sourceWorkSummaryDraft\s+AssistantWorkSummaryDraft\s+@relation\(fields: \[projectId, sourceWorkSummaryDraftId\], references: \[projectId, id\], onDelete: Restrict\)/,
);
assert.match(projectWikiItemModel, /DB invariant: migration enforces the common candidate relation as a scoped composite FK/);
assert.match(
  projectWikiItemModel,
  /commonCandidateRecord\s+AssistantTaskRecord\?\s+@relation\("ProjectWikiCommonCandidateRecord", fields: \[projectId, commonCandidateRecordId\], references: \[projectId, id\], onDelete: NoAction\)/,
);
assert.match(projectWikiItemModel, /@@unique\(\[projectId, id\]\)/);
assert.match(
  projectWikiActionLogModel,
  /item\s+ProjectWikiItem\s+@relation\(fields: \[projectId, projectWikiItemId\], references: \[projectId, id\], onDelete: Cascade\)/,
);
assert.doesNotMatch(
  projectWikiItemModel,
  /sourceReviewRecord\s+AssistantTaskRecord\s+@relation\("ProjectWikiSourceReviewRecord", fields: \[sourceReviewRecordId\], references: \[id\]/,
);
assert.doesNotMatch(
  projectWikiItemModel,
  /sourceWorkSummaryDraft\s+AssistantWorkSummaryDraft\s+@relation\(fields: \[sourceWorkSummaryDraftId\], references: \[id\]/,
);
assert.doesNotMatch(
  projectWikiItemModel,
  /commonCandidateRecord\s+AssistantTaskRecord\?\s+@relation\("ProjectWikiCommonCandidateRecord", fields: \[commonCandidateRecordId\], references: \[id\]/,
);
assert.doesNotMatch(
  projectWikiActionLogModel,
  /item\s+ProjectWikiItem\s+@relation\(fields: \[projectWikiItemId\], references: \[id\]/,
);
assert.match(
  migration,
  /create unique index "assistant_task_records_project_id_id_key"\s+on "assistant_task_records" \("project_id", "id"\)/,
);
assert.match(
  migration,
  /create unique index "assistant_work_summary_drafts_project_id_id_key"\s+on "assistant_work_summary_drafts" \("project_id", "id"\)/,
);
assert.match(
  migration,
  /foreign key \("project_id", "source_review_record_id"\) references "assistant_task_records" \("project_id", "id"\) on delete restrict on update cascade/,
);
assert.match(
  migration,
  /foreign key \("project_id", "source_work_summary_draft_id"\) references "assistant_work_summary_drafts" \("project_id", "id"\) on delete restrict on update cascade/,
);
assert.match(
  migration,
  /foreign key \("project_id", "common_candidate_record_id"\) references "assistant_task_records" \("project_id", "id"\) on delete set null \("common_candidate_record_id"\) on update cascade/,
);
assert.match(
  migration,
  /create unique index "project_wiki_items_project_id_id_key"\s+on "project_wiki_items" \("project_id", "id"\)/,
);
assert.match(
  migration,
  /foreign key \("project_id", "project_wiki_item_id"\) references "project_wiki_items" \("project_id", "id"\) on delete cascade on update cascade/,
);
assert.doesNotMatch(migration, /foreign key \("source_review_record_id"\) references "assistant_task_records" \("id"\)/);
assert.doesNotMatch(
  migration,
  /foreign key \("source_work_summary_draft_id"\) references "assistant_work_summary_drafts" \("id"\)/,
);
assert.doesNotMatch(migration, /foreign key \("common_candidate_record_id"\) references "assistant_task_records" \("id"\)/);
assert.doesNotMatch(migration, /foreign key \("project_wiki_item_id"\) references "project_wiki_items" \("id"\)/);
assert.match(
  migration,
  /constraint "project_wiki_items_status_check"\s+check \("status" in \('active', 'disabled'\)\)/,
);
assert.match(
  migration,
  /constraint "project_wiki_items_ai_suitability_state_check"\s+check \("ai_suitability_state" in \('recommended', 'caution', 'not_recommended'\)\)/,
);
assert.match(migration, /constraint "project_wiki_action_logs_action_check"\s+check \("action" in \('disable', 'restore'\)\)/);

const types = read("src/domains/project-wiki/types.ts");
assert.match(types, /^export type ProjectWikiStatus = "active" \| "disabled";$/m);
assert.match(types, /^export type ProjectWikiSuitabilityState = "recommended" \| "caution" \| "not_recommended";$/m);
assert.match(
  types,
  /^export type ProjectWikiRegistrationState = "not_evaluated" \| "recommended" \| "caution" \| "not_recommended" \| "registered";$/m,
);
assert.match(
  types,
  /^export type ProjectWikiSourceBadge = "프로젝트 WIKI" \| "공용 WIKI" \| "task" \| "도면\/문서" \| "법규" \| "외부";$/m,
);
assert.equal(
  normalizeTypeDefinition(readObjectType(types, "ProjectWikiDraft")),
  normalizeTypeDefinition(`export type ProjectWikiDraft = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  aiSuitabilityState: ProjectWikiSuitabilityState;
  aiSuitabilityReason: string;
  commonizationCaution: string;
};`),
);
assert.equal(
  normalizeTypeDefinition(readObjectType(types, "ProjectWikiItem")),
  normalizeTypeDefinition(`export type ProjectWikiItem = ProjectWikiDraft & {
  id: string;
  projectId: string;
  sourceTaskId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  commonCandidateRecordId: string | null;
  commonCandidateStatus: ProjectWikiCommonCandidateStatus;
  supplementalNote: string;
  status: ProjectWikiStatus;
  createdBy: string;
  createdByDisplay: string;
  createdAt: string;
  updatedAt: string;
  disabledBy: string | null;
  disabledAt: string | null;
  restoredBy: string | null;
  restoredAt: string | null;
};`),
);
assert.equal(
  normalizeTypeDefinition(readObjectType(types, "ProjectWikiActionLog")),
  normalizeTypeDefinition(`export type ProjectWikiActionLog = {
  id: string;
  projectId: string;
  projectWikiItemId: string;
  action: "disable" | "restore";
  actorProfileId: string;
  actorDisplay: string;
  reason: string;
  createdAt: string;
};`),
);

const contracts = read("src/repositories/project-wiki/contracts.ts");
const postgresStore = read("src/repositories/project-wiki/postgres-store.ts");
const localStore = read("src/repositories/project-wiki/local-store.ts");
const assistantContracts = read("src/repositories/assistant/contracts.ts");
const assistantIndex = read("src/repositories/assistant/index.ts");
const assistantLocalStore = read("src/repositories/assistant/local-store.ts");
const assistantPostgresStore = read("src/repositories/assistant/postgres-store.ts");
const adminKnowledgeService = read("src/use-cases/admin/knowledge-service.ts");
const projectWikiService = read("src/use-cases/project-wiki-service.ts");
const projectWikiRoute = read("src/app/api/projects/[projectId]/project-wiki/route.ts");
const projectWikiStatusRoute = read("src/app/api/projects/[projectId]/project-wiki/[itemId]/status/route.ts");
const projectWikiPage = read("src/components/project-context/project-wiki-page.tsx");
assert.equal(
  normalizeTypeDefinition(readObjectType(contracts, "RegisterProjectWikiInput")),
  normalizeTypeDefinition(`export type RegisterProjectWikiInput = {
  projectId: string;
  sourceTaskId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  supplementalNote: string;
  draft: ProjectWikiDraft;
  actorProfileId: string;
  actorDisplay?: string;
};`),
);
assert.equal(
  normalizeTypeDefinition(readObjectType(contracts, "BuildProjectWikiRegistrationPreviewInput")),
  normalizeTypeDefinition(`export type BuildProjectWikiRegistrationPreviewInput = {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
};`),
);
assert.match(contracts, /registerProjectWiki\(input: RegisterProjectWikiInput\): Promise<ProjectWikiItem>/);
assert.match(contracts, /setProjectWikiStatus\(input: SetProjectWikiStatusInput\): Promise<SetProjectWikiStatusResult>/);
assert.doesNotMatch(readObjectType(contracts, "RegisterProjectWikiInput"), /commonCandidateRecordId/);
assert.doesNotMatch(contracts, /RegisterProjectWikiResult/);
assert.doesNotMatch(contracts, /RegisterProjectWikiResult = \{[\s\S]*actionLog/);
assert.match(projectWikiRoute, /const draft = readOptionalDraft\(rawBody\)/);
assert.match(projectWikiRoute, /title: readOptionalString\(rawBody, "title"\) \?\? draft\?\.title/);
assert.match(projectWikiRoute, /summary: readOptionalString\(rawBody, "summary"\) \?\? draft\?\.summary/);
assert.match(projectWikiRoute, /bodyMarkdown: readOptionalString\(rawBody, "bodyMarkdown"\) \?\? draft\?\.bodyMarkdown/);
assert.match(projectWikiRoute, /tags: readOptionalStringArray\(rawBody, "tags"\) \?\? draft\?\.tags/);
assert.match(projectWikiRoute, /badRequest\("draft must be an object\.", "PROJECT_WIKI_DRAFT_INVALID"\)/);
assert.match(projectWikiService, /title\?: string;/);
assert.match(projectWikiService, /summary\?: string;/);
assert.match(projectWikiService, /bodyMarkdown\?: string;/);
assert.match(projectWikiService, /tags\?: string\[\];/);
assert.match(projectWikiService, /const draft = applyProjectWikiDraftEdits\(storedPreview\.draft/);
assert.match(projectWikiService, /draft,\s*actorProfileId/s);
assert.doesNotMatch(projectWikiService, /draft: storedPreview\.draft/);
assert.match(projectWikiService, /PROJECT_WIKI_STATUS_PERMISSION_REASON/);
assert.match(projectWikiService, /input\.user\.role === "admin"/);
assert.match(projectWikiService, /input\.projectRole === "manager"/);
assert.match(projectWikiService, /input\.item\.createdBy === input\.user\.id/);
assert.match(projectWikiService, /forbidden\(statusControl\.reason, "PROJECT_WIKI_STATUS_FORBIDDEN"\)/);
assert.match(projectWikiService, /normalizeStatusReason\(action, input\.reason\)/);
assert.match(projectWikiService, /PROJECT_WIKI_DISABLE_REASON_REQUIRED/);
assert.match(projectWikiStatusRoute, /reason: typeof rawBody\.reason === "string" \? rawBody\.reason : ""/);
assert.match(projectWikiPage, /statusControl:\s*\{\s*canChangeStatus:\s*boolean;/);
assert.match(projectWikiPage, /placeholder=\{selectedDetail\.item\.status === "active" \? "비활성화 사유 필수" : "복원 사유 선택 입력"\}/);
assert.match(projectWikiPage, /disabled=\{isStatusControlDisabled\(selectedDetail, busy, reason\)\}/);
assert.match(projectWikiPage, /statusControl\.reason/);
assert.match(postgresStore, /updateCommonWikiCandidateSourceStatus/);
assert.match(postgresStore, /commonWikiCandidate:\s*\{\s*\.\.\.\(metadata\.commonWikiCandidate \?\? \{\}\),\s*sourceProjectWikiStatus: input\.status/s);
assert.match(postgresStore, /commonCandidateRecordId: current\.commonCandidateRecordId/);
assert.match(
  postgresStore,
  /normalizeProjectWikiStatus\(current\.status\) === input\.status[\s\S]*updateCommonWikiCandidateSourceStatus\(tx,[\s\S]*commonCandidateRecordId: current\.commonCandidateRecordId[\s\S]*actionLog: null/,
);
assert.doesNotMatch(
  postgresStore.slice(
    postgresStore.indexOf("function updateCommonWikiCandidateSourceStatus"),
    postgresStore.indexOf("function mergeReviewSessionProjectWikiState"),
  ),
  /candidateState/,
);
assert.match(localStore, /updateLocalCommonWikiCandidateSourceStatus\(current, input\.status\)[\s\S]*actionLog: null/);
assert.match(localStore, /updateLocalCommonWikiCandidateSourceStatus\(item, input\.status\)/);
assert.match(localStore, /assistantRepository\.updateCommonWikiCandidateSourceStatus/);
assert.match(assistantContracts, /updateCommonWikiCandidateSourceStatus\(input: \{/);
assert.match(assistantIndex, /updateCommonWikiCandidateSourceStatus\(input\)/);
assert.match(assistantLocalStore, /async updateCommonWikiCandidateSourceStatus/);
assert.match(assistantPostgresStore, /async updateCommonWikiCandidateSourceStatus/);
assert.doesNotMatch(
  assistantLocalStore.slice(
    assistantLocalStore.indexOf("async updateCommonWikiCandidateSourceStatus"),
    assistantLocalStore.indexOf("async createExternalEvidence"),
  ),
  /candidateState/,
);
assert.doesNotMatch(
  assistantPostgresStore.slice(
    assistantPostgresStore.indexOf("async updateCommonWikiCandidateSourceStatus"),
    assistantPostgresStore.indexOf("async createExternalEvidence"),
  ),
  /candidateState/,
);
assert.match(adminKnowledgeService, /resolveSourceProjectWiki/);
assert.match(adminKnowledgeService, /projectWikiRepository\.getProjectWikiItem/);
assert.match(adminKnowledgeService, /status: item\?\.status \?\? metadataStatus/);
assert.match(adminKnowledgeService, /supplementalNote: commonWikiCandidate\.supplementalNote/);
assert.match(adminKnowledgeService, /commonizationCaution: commonWikiCandidate\.commonizationCaution/);
assert.match(adminKnowledgeService, /projectSpecificContext: commonWikiCandidate\.projectSpecificContext === true/);
for (const name of [
  "listProjectWikiItems",
  "getProjectWikiItem",
  "findProjectWikiBySourceReviewRecord",
  "buildProjectWikiRegistrationPreview",
  "registerProjectWiki",
  "setProjectWikiStatus",
  "searchProjectWikiForAssistant",
]) {
  assert.match(contracts, new RegExp(`${name}\\(`));
}

assert.equal(packageJson.scripts?.["project-wiki:validate"], "tsx scripts/project-wiki-contract-validate.ts");
assert.equal(packageJson.scripts?.["project-wiki:behavior:validate"], "tsx scripts/project-wiki-behavior-validate.ts");
assert.equal(packageJson.scripts?.["project-wiki:preview-smoke"], "tsx scripts/project-wiki-preview-smoke.ts");

console.log("project-wiki-contract-validate: ok");
