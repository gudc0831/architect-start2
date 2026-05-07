import { randomUUID } from "node:crypto";
import type { ApprovedKnowledgeItem, AssistantCandidateState, AssistantRecord, AssistantWorkSummaryDraft } from "@/domains/assistant/types";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import type {
  AssistantRepository,
  CreateAssistantRecordInput,
  ReviewKnowledgeCandidateInput,
  SaveAssistantWorkSummaryDraftInput,
} from "@/repositories/assistant/contracts";

type AssistantLocalStore = {
  records: AssistantRecord[];
  summaries: AssistantWorkSummaryDraft[];
};

const emptyStore: AssistantLocalStore = {
  records: [],
  summaries: [],
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeStore(value: Partial<AssistantLocalStore>): AssistantLocalStore {
  return {
    records: Array.isArray(value.records) ? value.records.map(normalizeRecord) : [],
    summaries: Array.isArray(value.summaries) ? value.summaries : [],
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
      cleanupState: "draft",
      candidateState: "candidate",
      metadata: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await writeLocalStore("assistant", { ...store, records: [record, ...store.records] }, { reason: "assistant.record.create" });
    return record;
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

    await writeLocalStore("assistant", { records, summaries }, { reason: "assistant.summary.save" });
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
}

export const localAssistantRepository = new LocalAssistantRepository();
