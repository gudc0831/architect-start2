import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { knowledgeAuditEventTypes } from "@/domains/admin/knowledge-workflow";
import type { AuthUser } from "@/domains/auth/types";
import {
  knowledgeSourceKinds,
  type KnowledgeGenerationProfile,
  type KnowledgeSourceKind,
  type KnowledgeTocItem,
} from "@/domains/knowledge/structured-knowledge";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { backendMode } from "@/lib/backend-mode";
import { prisma } from "@/lib/prisma";

export type KnowledgeGenerationProfileView = KnowledgeGenerationProfile;

type CreateGenerationProfileInput = {
  name?: unknown;
  sourceBucketRules?: unknown;
  tocTemplate?: unknown;
  ontologySchema?: unknown;
  citationRules?: unknown;
  sectionRules?: unknown;
};

type SourceBucketRule = { required: boolean; maxItems: number };

const defaultProfileName = "approved-wiki-generation-profile";

const defaultSourceBucketRules = {
  legal_evidence: { required: false, maxItems: 8 },
  task_context: { required: true, maxItems: 4 },
  project_document: { required: false, maxItems: 8 },
  approved_wiki: { required: false, maxItems: 6 },
  local_wiki: { required: false, maxItems: 6 },
  external_evidence: { required: false, maxItems: 6 },
} satisfies Record<KnowledgeSourceKind, SourceBucketRule>;

const defaultTocTemplate: KnowledgeTocItem[] = [
  { id: "summary", level: 2, title: "요약", purpose: "summary", required: true },
  { id: "applicability", level: 2, title: "적용 기준", purpose: "applicability", required: true },
  { id: "procedure", level: 2, title: "확인 절차", purpose: "procedure", required: true },
  { id: "evidence", level: 2, title: "근거", purpose: "evidence", required: true },
  { id: "exceptions", level: 2, title: "예외 / 주의", purpose: "exception", required: true },
  { id: "related", level: 2, title: "관련 WIKI", purpose: "related", required: false },
];

const defaultOntologySchema = {
  objective: "Structure approved WIKI as reusable knowledge for future ontology links and retrieval reuse.",
  sourceBuckets: [...knowledgeSourceKinds],
  node: {
    requiredFields: ["conceptId", "label", "category", "scope", "relations"],
    categories: ["legal_rule", "workflow", "project_condition", "design_decision", "reference"],
    relationKinds: ["parent", "child", "related", "depends_on", "conflicts_with", "supersedes", "supplements"],
  },
  reuse: {
    bodyKind: "common_reusable_knowledge",
    markdownExcludes: ["task_number", "provider_name", "model_name", "usage_metadata", "cost_metadata"],
  },
};

const defaultCitationRules = [
  "Cite specific legal provisions, article numbers, clauses, dates, document titles, and locators when legal evidence is used.",
  "Prefer verified legal evidence for legal_basis claims and carry sourceRefIds into the claim evidence matrix.",
  "If evidence is missing, stale, or conflicting, record the gap instead of inventing a citation.",
];

const defaultSectionRules = [
  "Write the WIKI body as common reusable knowledge, not as a one-off task report.",
  "Avoid task numbers, provider names, model names, token usage, cost, prompt, and execution metadata in markdown.",
  "Keep section headings aligned to the TOC template and use stable anchors for future ontology and reuse workflows.",
  "Structure claims so related WIKI links, ontology relations, and source references can be reused later.",
];

const protectedTocPurposes = ["summary", "applicability", "procedure", "evidence", "exception"] as const;
const localGenerationProfiles: KnowledgeGenerationProfileView[] = [];

export async function listKnowledgeGenerationProfiles(): Promise<KnowledgeGenerationProfileView[]> {
  if (backendMode !== "cloud") {
    return localGenerationProfiles.map(cloneProfile).sort(sortProfileView);
  }

  const profiles = await prisma.knowledgeGenerationProfile.findMany({
    orderBy: [{ state: "asc" }, { name: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });
  return profiles.map(toProfileView);
}

export async function getOrCreateActiveKnowledgeGenerationProfile(
  user: AuthUser,
): Promise<KnowledgeGenerationProfileView> {
  if (backendMode !== "cloud") {
    const active = localGenerationProfiles
      .filter((profile) => profile.name === defaultProfileName && profile.state === "active")
      .sort((left, right) => right.version - left.version)[0];
    if (active) {
      return cloneProfile(active);
    }
    const created = createLocalProfile({
      name: defaultProfileName,
      version: 1,
      state: "active",
      sourceBucketRules: defaultSourceBucketRules,
      tocTemplate: defaultTocTemplate,
      ontologySchema: defaultOntologySchema,
      citationRules: defaultCitationRules,
      sectionRules: defaultSectionRules,
      user,
    });
    localGenerationProfiles.unshift(created);
    return cloneProfile(created);
  }

  const active = await prisma.knowledgeGenerationProfile.findFirst({
    where: { name: defaultProfileName, state: "active" },
    orderBy: { version: "desc" },
  });
  if (active) {
    return toProfileView(active);
  }

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeGenerationProfile.create({
      data: {
        name: defaultProfileName,
        version: 1,
        state: "active",
        sourceBucketRules: toInputJson(defaultSourceBucketRules),
        tocTemplate: toInputJson(defaultTocTemplate),
        ontologySchema: toInputJson(defaultOntologySchema),
        citationRules: toInputJson(defaultCitationRules),
        sectionRules: toInputJson(defaultSectionRules),
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await tx.assistantAuditEvent.create({
      data: {
        projectId: null,
        profileId: user.id,
        eventType: knowledgeAuditEventTypes.generationProfileActivated,
        targetType: "knowledge_generation_profile",
        targetId: created.id,
        metadata: { name: created.name, version: created.version, bootstrap: true } as Prisma.InputJsonValue,
      },
    });
    return created;
  });
  return toProfileView(profile);
}

export async function createKnowledgeGenerationProfileDraft(
  input: CreateGenerationProfileInput,
  user: AuthUser,
): Promise<KnowledgeGenerationProfileView> {
  const name = normalizeOptionalText(input.name) || defaultProfileName;
  if (backendMode !== "cloud") {
    const latest = localGenerationProfiles
      .filter((profile) => profile.name === name)
      .sort((left, right) => right.version - left.version)[0];
    const created = createLocalProfile({
      name,
      version: (latest?.version ?? 0) + 1,
      state: "draft",
      sourceBucketRules: normalizeSourceBucketRules(input.sourceBucketRules),
      tocTemplate: normalizeTocTemplate(input.tocTemplate),
      ontologySchema: normalizeRecord(input.ontologySchema, defaultOntologySchema),
      citationRules: normalizeStringArray(input.citationRules, defaultCitationRules),
      sectionRules: normalizeStringArray(input.sectionRules, defaultSectionRules),
      user,
    });
    localGenerationProfiles.unshift(created);
    return cloneProfile(created);
  }

  const latest = await prisma.knowledgeGenerationProfile.findFirst({
    where: { name },
    orderBy: { version: "desc" },
  });
  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeGenerationProfile.create({
      data: {
        name,
        version: (latest?.version ?? 0) + 1,
        state: "draft",
        sourceBucketRules: toInputJson(normalizeSourceBucketRules(input.sourceBucketRules)),
        tocTemplate: toInputJson(normalizeTocTemplate(input.tocTemplate)),
        ontologySchema: toInputJson(normalizeRecord(input.ontologySchema, defaultOntologySchema)),
        citationRules: toInputJson(normalizeStringArray(input.citationRules, defaultCitationRules)),
        sectionRules: toInputJson(normalizeStringArray(input.sectionRules, defaultSectionRules)),
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await tx.assistantAuditEvent.create({
      data: {
        projectId: null,
        profileId: user.id,
        eventType: knowledgeAuditEventTypes.generationProfileCreated,
        targetType: "knowledge_generation_profile",
        targetId: created.id,
        metadata: { name: created.name, version: created.version } as Prisma.InputJsonValue,
      },
    });
    return created;
  });
  return toProfileView(profile);
}

export async function activateKnowledgeGenerationProfile(
  profileId: string,
  user: AuthUser,
): Promise<KnowledgeGenerationProfileView> {
  if (backendMode !== "cloud") {
    const profile = findLocalProfile(profileId);
    if (profile.state === "active") {
      return cloneProfile(profile);
    }
    if (profile.state !== "draft" && profile.state !== "archived") {
      throw conflict(
        "Only draft or archived generation profiles can be activated.",
        "KNOWLEDGE_GENERATION_PROFILE_ACTIVATE_STATE_INVALID",
      );
    }
    const timestamp = new Date().toISOString();
    for (const current of localGenerationProfiles) {
      if (current.name === profile.name && current.state === "active") {
        current.state = "archived";
        current.archivedAt = timestamp;
        current.updatedAt = timestamp;
        current.updatedBy = user.id;
      }
    }
    profile.state = "active";
    profile.archivedAt = null;
    profile.updatedAt = timestamp;
    profile.updatedBy = user.id;
    return cloneProfile(profile);
  }

  const profile = await prisma.knowledgeGenerationProfile.findUnique({
    where: { id: normalizeRequiredText(profileId, "profileId") },
  });
  if (!profile) {
    throw notFound("Generation profile not found.", "KNOWLEDGE_GENERATION_PROFILE_NOT_FOUND");
  }
  if (profile.state === "active") {
    return toProfileView(profile);
  }
  if (profile.state !== "draft" && profile.state !== "archived") {
    throw conflict(
      "Only draft or archived generation profiles can be activated.",
      "KNOWLEDGE_GENERATION_PROFILE_ACTIVATE_STATE_INVALID",
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const previous = await tx.knowledgeGenerationProfile.findFirst({
      where: { name: profile.name, state: "active" },
    });
    if (previous) {
      await tx.knowledgeGenerationProfile.update({
        where: { id: previous.id },
        data: { state: "archived", archivedAt: now, updatedBy: user.id },
      });
    }
    const activated = await tx.knowledgeGenerationProfile.update({
      where: { id: profile.id },
      data: { state: "active", archivedAt: null, updatedBy: user.id },
    });
    await tx.assistantAuditEvent.create({
      data: {
        projectId: null,
        profileId: user.id,
        eventType: knowledgeAuditEventTypes.generationProfileActivated,
        targetType: "knowledge_generation_profile",
        targetId: activated.id,
        metadata: { name: activated.name, version: activated.version } as Prisma.InputJsonValue,
      },
    });
    return activated;
  });
  return toProfileView(updated);
}

export async function rollbackKnowledgeGenerationProfile(
  profileId: string,
  input: { reason?: unknown },
  user: AuthUser,
): Promise<KnowledgeGenerationProfileView> {
  const reason = normalizeOptionalText(input.reason);
  if (!reason) {
    throw badRequest(
      "Rollback reason is required.",
      "KNOWLEDGE_GENERATION_PROFILE_ROLLBACK_REASON_REQUIRED",
    );
  }
  if (backendMode !== "cloud") {
    const restored = findLocalProfile(profileId);
    if (restored.state !== "archived") {
      throw conflict(
        "Only archived generation profiles can be rolled back.",
        "KNOWLEDGE_GENERATION_PROFILE_ROLLBACK_STATE_INVALID",
      );
    }
    const timestamp = new Date().toISOString();
    for (const current of localGenerationProfiles) {
      if (current.name === restored.name && current.state === "active") {
        current.state = "archived";
        current.archivedAt = timestamp;
        current.updatedAt = timestamp;
        current.updatedBy = user.id;
      }
    }
    restored.state = "active";
    restored.archivedAt = null;
    restored.updatedAt = timestamp;
    restored.updatedBy = user.id;
    return cloneProfile(restored);
  }

  const restored = await prisma.knowledgeGenerationProfile.findUnique({
    where: { id: normalizeRequiredText(profileId, "profileId") },
  });
  if (!restored || restored.state !== "archived") {
    throw conflict(
      "Only archived generation profiles can be rolled back.",
      "KNOWLEDGE_GENERATION_PROFILE_ROLLBACK_STATE_INVALID",
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.knowledgeGenerationProfile.findFirst({
      where: { name: restored.name, state: "active" },
    });
    if (current) {
      await tx.knowledgeGenerationProfile.update({
        where: { id: current.id },
        data: { state: "archived", archivedAt: now, updatedBy: user.id },
      });
    }
    const activated = await tx.knowledgeGenerationProfile.update({
      where: { id: restored.id },
      data: { state: "active", archivedAt: null, updatedBy: user.id },
    });
    await tx.assistantAuditEvent.create({
      data: {
        projectId: null,
        profileId: user.id,
        eventType: knowledgeAuditEventTypes.generationProfileRolledBack,
        targetType: "knowledge_generation_profile",
        targetId: activated.id,
        metadata: { reason, restoredProfileId: activated.id, restoredVersion: activated.version } as Prisma.InputJsonValue,
      },
    });
    return activated;
  });
  return toProfileView(updated);
}

function createLocalProfile(input: {
  name: string;
  version: number;
  state: KnowledgeGenerationProfileView["state"];
  sourceBucketRules: KnowledgeGenerationProfileView["sourceBucketRules"];
  tocTemplate: KnowledgeTocItem[];
  ontologySchema: Record<string, unknown>;
  citationRules: string[];
  sectionRules: string[];
  user: AuthUser;
}): KnowledgeGenerationProfileView {
  const timestamp = new Date().toISOString();
  return {
    id: randomUUID(),
    name: input.name,
    version: input.version,
    state: input.state,
    sourceBucketRules: cloneJson(input.sourceBucketRules),
    tocTemplate: cloneJson(input.tocTemplate),
    ontologySchema: cloneJson(input.ontologySchema),
    citationRules: [...input.citationRules],
    sectionRules: [...input.sectionRules],
    createdBy: input.user.id,
    updatedBy: input.user.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: input.state === "archived" ? timestamp : null,
  };
}

function findLocalProfile(profileId: string) {
  const normalizedProfileId = normalizeRequiredText(profileId, "profileId");
  const profile = localGenerationProfiles.find((item) => item.id === normalizedProfileId);
  if (!profile) {
    throw notFound("Generation profile not found.", "KNOWLEDGE_GENERATION_PROFILE_NOT_FOUND");
  }
  return profile;
}

function cloneProfile(profile: KnowledgeGenerationProfileView): KnowledgeGenerationProfileView {
  return cloneJson(profile);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortProfileView(left: KnowledgeGenerationProfileView, right: KnowledgeGenerationProfileView) {
  return left.state.localeCompare(right.state) || left.name.localeCompare(right.name) || right.updatedAt.localeCompare(left.updatedAt);
}

function toProfileView(profile: {
  id: string;
  name: string;
  version: number;
  state: string;
  sourceBucketRules: Prisma.JsonValue;
  tocTemplate: Prisma.JsonValue;
  ontologySchema: Prisma.JsonValue;
  citationRules: Prisma.JsonValue;
  sectionRules: Prisma.JsonValue;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): KnowledgeGenerationProfileView {
  return {
    id: profile.id,
    name: profile.name,
    version: profile.version,
    state: profile.state as KnowledgeGenerationProfileView["state"],
    sourceBucketRules: redactSensitiveValue(profile.sourceBucketRules) as KnowledgeGenerationProfileView["sourceBucketRules"],
    tocTemplate: normalizeTocTemplate(redactSensitiveValue(profile.tocTemplate)),
    ontologySchema: redactSensitiveValue(profile.ontologySchema) as KnowledgeGenerationProfileView["ontologySchema"],
    citationRules: normalizeStringArray(redactSensitiveValue(profile.citationRules), []),
    sectionRules: normalizeStringArray(redactSensitiveValue(profile.sectionRules), []),
    createdBy: profile.createdBy,
    updatedBy: profile.updatedBy,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    archivedAt: profile.archivedAt?.toISOString() ?? null,
  };
}

function normalizeSourceBucketRules(value: unknown): Record<KnowledgeSourceKind, SourceBucketRule> {
  const record = isRecord(value) ? value : {};
  return knowledgeSourceKinds.reduce((rules, sourceKind) => {
    const fallback = defaultSourceBucketRules[sourceKind];
    const rule = isRecord(record[sourceKind]) ? record[sourceKind] : {};
    rules[sourceKind] = {
      required: sourceKind === "task_context" ? true : typeof rule.required === "boolean" ? rule.required : fallback.required,
      maxItems: normalizeMaxItems(rule.maxItems, fallback.maxItems),
    };
    return rules;
  }, {} as Record<KnowledgeSourceKind, SourceBucketRule>);
}

function normalizeTocTemplate(value: unknown): KnowledgeTocItem[] {
  if (!Array.isArray(value)) {
    return defaultTocTemplate;
  }
  const toc = value.map(normalizeTocItem).filter((item): item is KnowledgeTocItem => Boolean(item));
  if (!toc.length) {
    return defaultTocTemplate;
  }
  const purposes = new Set(toc.map((item) => item.purpose));
  const missingProtected = defaultTocTemplate.filter(
    (item) => protectedTocPurposes.includes(item.purpose as (typeof protectedTocPurposes)[number]) && !purposes.has(item.purpose),
  );
  return [...toc, ...missingProtected];
}

function normalizeTocItem(value: unknown): KnowledgeTocItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = normalizeOptionalText(value.id);
  const title = normalizeOptionalText(value.title);
  const purpose = normalizeTocPurpose(value.purpose);
  if (!id || !title || !purpose) {
    return null;
  }
  return {
    id,
    level: value.level === 1 || value.level === 3 ? value.level : 2,
    title,
    purpose,
    required: typeof value.required === "boolean" ? value.required : true,
  };
}

function normalizeTocPurpose(value: unknown): KnowledgeTocItem["purpose"] | null {
  return value === "summary" ||
    value === "applicability" ||
    value === "procedure" ||
    value === "evidence" ||
    value === "exception" ||
    value === "related" ||
    value === "history"
    ? value
    : null;
}

function normalizeRecord(value: unknown, fallback: Record<string, unknown>) {
  return isRecord(value) ? value : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeMaxItems(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 50 ? value : fallback;
}

function normalizeRequiredText(value: unknown, label: string) {
  const text = normalizeOptionalText(value);
  if (!text) {
    throw badRequest(`${label} is required.`, "KNOWLEDGE_GENERATION_PROFILE_REQUIRED_FIELD");
  }
  return text;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redactSensitiveValue(value: unknown): unknown {
  if (typeof value === "string") {
    return isSensitiveText(value) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValue);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSensitiveValue(item)]),
    );
  }
  return value;
}

function isSensitiveText(value: string) {
  return /(OPENAI_API_KEY|ANTHROPIC_API_KEY|LAW_OPEN_DATA_OC|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]|password\s*[:=]|sk-[A-Za-z0-9]{8,})/i.test(value) ||
    /([A-Za-z]:\\|\\\\\?\\|\/Users\/|\/home\/)/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
