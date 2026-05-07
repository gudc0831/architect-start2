import { randomUUID } from "node:crypto";
import type { AssistantRecord, AssistantWorkSummaryDraft } from "@/domains/assistant/types";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import type {
  AssistantRepository,
  CreateAssistantRecordInput,
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
    records: Array.isArray(value.records) ? value.records : [],
    summaries: Array.isArray(value.summaries) ? value.summaries : [],
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

  async findRecordById(recordId: string) {
    const store = await readStore();
    return store.records.find((record) => record.id === recordId) ?? null;
  }

  async createRecord(input: CreateAssistantRecordInput) {
    const store = await readStore();
    const timestamp = nowIso();
    const record: AssistantRecord = {
      id: randomUUID(),
      ...input,
      cleanupState: "draft",
      candidateState: "candidate",
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
}

export const localAssistantRepository = new LocalAssistantRepository();
