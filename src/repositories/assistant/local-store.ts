import { randomUUID } from "node:crypto";
import {
  type CreateExternalEvidenceInput,
  externalEvidenceToAssistantEvidence,
  normalizeExternalEvidenceMetadata,
} from "@/domains/assistant/external-evidence";
import type { ApprovedKnowledgeItem, AssistantCandidateState, AssistantRecord, AssistantWorkSummaryDraft } from "@/domains/assistant/types";
import type { AssistantAuditEvent, AssistantRunPolicy, AssistantUsageEvent } from "@/domains/assistant/saas-api-mode";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import type {
  AssistantRepository,
  CreateAssistantAuditEventInput,
  CreateAssistantRecordInput,
  CreateAssistantUsageEventInput,
  ListAssistantAuditEventsInput,
  ListAssistantUsageEventsInput,
  ReviewKnowledgeCandidateInput,
  SaveAssistantWorkSummaryDraftInput,
  UpsertAssistantRunPolicyInput,
} from "@/repositories/assistant/contracts";

type AssistantLocalStore = {
  records: AssistantRecord[];
  summaries: AssistantWorkSummaryDraft[];
  runPolicies: AssistantRunPolicy[];
  usageEvents: AssistantUsageEvent[];
  auditEvents: AssistantAuditEvent[];
};

const emptyStore: AssistantLocalStore = {
  records: [],
  summaries: [],
  runPolicies: [],
  usageEvents: [],
  auditEvents: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeStore(value: Partial<AssistantLocalStore>): AssistantLocalStore {
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeRecord) : [],
    summaries: Array.isArray(value.summaries) ? value.summaries : [],
    runPolicies: Array.isArray(value.runPolicies) ? value.runPolicies : [],
    usageEvents: Array.isArray(value.usageEvents) ? value.usageEvents : [],
    auditEvents: Array.isArray(value.auditEvents) ? value.auditEvents : [],
  };
}

function normalizeRecord(record: AssistantRecord): AssistantRecord {
  return {
    ...record,
    metadata: record.metadata ?? {},
  };
}

async function readStore() {
  const parsed = (await readLocalStore<Partial<AssistantLocalStore>>("assistant", emptyStore)).value;
  return normalizeStore(parsed);
}

class LocalAssistantRepository implements AssistantRepository {
  async listRecordsByTask(taskId: string) {
    const store = await readStore();
    return store.records
      .filter((record) => record.taskId === taskId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listExternalEvidenceByTask(taskId: string) {
    const store = await readStore();
    return store.records
      .filter((record) => record.taskId === taskId)
      .map((record) => normalizeExternalEvidenceMetadata(record.metadata.externalEvidence))
      .filter((record) => record !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listKnowledgeCandidateRecords(input?: { states?: AssistantCandidateState[] }) {
    const store = await readStore();
    const states = new Set(input?.states ?? ["candidate", "pending_review", "approved", "rejected"]);
    return store.records
      .filter((record) => states.has(record.candidateState))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findRecordById(recordId: string) {
    const store = await readStore();
    return store.records.find((record) => record.id === recordId) ?? null;
  }

  async findWorkSummaryDraftByRecordId(recordId: string) {
    const store = await readStore();
    return store.summaries.find((summary) => summary.recordId === recordId) ?? null;
  }

  async createRecord(input: CreateAssistantRecordInput) {
    const store = await readStore();
    const timestamp = nowIso();
    const record: AssistantRecord = {
      id: randomUUID(),
      ...input,
      cleanupState: input.cleanupState ?? "draft",
      candidateState: input.candidateState ?? "candidate",
      metadata: input.metadata ?? {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await writeLocalStore("assistant", { ...store, records: [record, ...store.records] }, { reason: "assistant.record.create" });
    return record;
  }

  async createExternalEvidence(input: CreateExternalEvidenceInput) {
    const store = await readStore();
    const timestamp = nowIso();
    const externalEvidence = {
      id: randomUUID(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const record: AssistantRecord = {
      id: externalEvidence.id,
      projectId: input.projectId,
      taskId: input.taskId,
      profileId: input.createdBy,
      question: `External evidence: ${input.title}`,
      answer: input.excerpt,
      evidence: [externalEvidenceToAssistantEvidence(externalEvidence)],
      confidenceScore: Math.round((externalEvidenceToAssistantEvidence(externalEvidence).confidenceWeight ?? 0.28) * 100),
      confidenceReason: "User-approved external web/skill evidence saved for assistant retrieval.",
      executionMode: "unavailable",
      runtimeMode: "external-evidence",
      draftSummary: null,
      cleanupState: "deferred",
      candidateState: "not_candidate",
      metadata: { externalEvidence },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await writeLocalStore(
      "assistant",
      { ...store, records: [record, ...store.records] },
      { reason: "assistant.external-evidence.create" },
    );
    return externalEvidence;
  }

  async saveWorkSummaryDraft(input: SaveAssistantWorkSummaryDraftInput) {
    const store = await readStore();
    const timestamp = nowIso();
    const existingIndex = store.summaries.findIndex((summary) => summary.recordId === input.recordId);
    const current = existingIndex >= 0 ? store.summaries[existingIndex] : null;
    const summary: AssistantWorkSummaryDraft = {
      id: current?.id ?? randomUUID(),
      ...input,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const summaries = [...store.summaries];
    if (existingIndex >= 0) {
      summaries[existingIndex] = summary;
    } else {
      summaries.unshift(summary);
    }

    const records = store.records.map((record) =>
      record.id === input.recordId ? { ...record, cleanupState: input.status, updatedAt: timestamp } : record,
    );

    await writeLocalStore("assistant", { ...store, records, summaries }, { reason: "assistant.summary.save" });
    return summary;
  }

  async reviewKnowledgeCandidate(input: ReviewKnowledgeCandidateInput) {
    const store = await readStore();
    const timestamp = nowIso();
    const record = store.records.find((item) => item.id === input.recordId);
    if (!record) {
      throw new Error("Assistant record not found");
    }

    const approvedKnowledgeItem =
      input.action === "approve"
        ? ({
            id: randomUUID(),
            title: input.title,
            summary: input.summary,
            bodyMarkdown: input.bodyMarkdown,
            tags: input.tags,
            scope: input.scope,
            sourceRecordId: record.id,
            sourceTaskId: record.taskId,
            sourceProjectId: record.projectId,
            sourceReferences: record.evidence,
            approvedBy: input.reviewerId,
            approvedAt: timestamp,
          } satisfies ApprovedKnowledgeItem)
        : null;

    const knowledgeReview =
      input.action === "reject"
        ? {
            status: "rejected" as const,
            reviewerId: input.reviewerId,
            reviewedAt: timestamp,
            rejectionReason: input.rejectionReason,
          }
        : {
            status: "approved" as const,
            reviewerId: input.reviewerId,
            reviewedAt: timestamp,
          };

    const nextRecord: AssistantRecord = {
      ...record,
      candidateState: input.action === "approve" ? "approved" : "rejected",
      metadata: {
        ...record.metadata,
        knowledgeReview,
        approvedKnowledgeItem: approvedKnowledgeItem ?? record.metadata.approvedKnowledgeItem,
      },
      updatedAt: timestamp,
    };

    await writeLocalStore(
      "assistant",
      {
        ...store,
        records: store.records.map((item) => (item.id === record.id ? nextRecord : item)),
      },
      { reason: `knowledge.candidate.${input.action}` },
    );

    return { record: nextRecord, approvedKnowledgeItem };
  }

  async getRunPolicy(projectId: string) {
    const store = await readStore();
    return store.runPolicies.find((policy) => policy.projectId === projectId) ?? null;
  }

  async upsertRunPolicy(input: UpsertAssistantRunPolicyInput) {
    const store = await readStore();
    const timestamp = nowIso();
    const current = store.runPolicies.find((policy) => policy.projectId === input.projectId);
    const policy: AssistantRunPolicy = {
      id: current?.id ?? randomUUID(),
      scopeType: "project",
      projectId: input.projectId,
      enabled: input.enabled,
      provider: input.provider,
      model: input.model,
      monthlyBudgetCents: input.monthlyBudgetCents,
      maxInputTokens: input.maxInputTokens,
      maxOutputTokens: input.maxOutputTokens,
      externalEvidenceAllowed: input.externalEvidenceAllowed,
      allowedEvidenceKinds: input.allowedEvidenceKinds,
      retentionDays: input.retentionDays,
      createdBy: current?.createdBy ?? input.actorId,
      updatedBy: input.actorId,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await writeLocalStore(
      "assistant",
      {
        ...store,
        runPolicies: [policy, ...store.runPolicies.filter((item) => item.projectId !== input.projectId)],
      },
      { reason: "assistant.saas-policy.upsert" },
    );

    return policy;
  }

  async createUsageEvent(input: CreateAssistantUsageEventInput) {
    const store = await readStore();
    const event: AssistantUsageEvent = {
      id: randomUUID(),
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      profileId: input.profileId,
      assistantRecordId: input.assistantRecordId ?? null,
      executionMode: "saas-api",
      runtimeMode: input.runtimeMode,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostCents: input.estimatedCostCents,
      status: input.status,
      policyDecision: input.policyDecision,
      requestHash: input.requestHash ?? null,
      errorCode: input.errorCode ?? null,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };

    await writeLocalStore(
      "assistant",
      { ...store, usageEvents: [event, ...store.usageEvents] },
      { reason: "assistant.usage.create" },
    );

    return event;
  }

  async listUsageEvents(input: ListAssistantUsageEventsInput) {
    const store = await readStore();
    return store.usageEvents
      .filter((event) => event.projectId === input.projectId && (!input.month || event.createdAt.startsWith(`${input.month}-`)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createAuditEvent(input: CreateAssistantAuditEventInput) {
    const store = await readStore();
    const event: AssistantAuditEvent = {
      id: randomUUID(),
      projectId: input.projectId ?? null,
      profileId: input.profileId ?? null,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };

    await writeLocalStore(
      "assistant",
      { ...store, auditEvents: [event, ...store.auditEvents] },
      { reason: "assistant.audit.create" },
    );

    return event;
  }

  async listAuditEvents(input: ListAssistantAuditEventsInput) {
    const store = await readStore();
    const eventTypes = input.eventTypes ? new Set(input.eventTypes) : null;
    return store.auditEvents
      .filter((event) => {
        const projectMatches = input.projectId ? event.projectId === input.projectId : true;
        const monthMatches = !input.month || event.createdAt.startsWith(`${input.month}-`);
        const eventTypeMatches = eventTypes ? eventTypes.has(event.eventType) : true;
        const targetTypeMatches = input.targetType ? event.targetType === input.targetType : true;
        return projectMatches && monthMatches && eventTypeMatches && targetTypeMatches;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 100);
  }

  async deleteAuditEventsByIds(input: { projectId: string; ids: string[] }) {
    const store = await readStore();
    const requestedIds = new Set(input.ids);
    const deletedIds = store.auditEvents
      .filter((event) => event.projectId === input.projectId && requestedIds.has(event.id))
      .map((event) => event.id);
    const deletedIdSet = new Set(deletedIds);
    const skippedIds = input.ids.filter((id) => !deletedIdSet.has(id));

    await writeLocalStore(
      "assistant",
      { ...store, auditEvents: store.auditEvents.filter((event) => !deletedIdSet.has(event.id)) },
      { reason: "assistant.audit.delete" },
    );

    return { deletedIds, skippedIds };
  }
}

export const localAssistantRepository = new LocalAssistantRepository();
