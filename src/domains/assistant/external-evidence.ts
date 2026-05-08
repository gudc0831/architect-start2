import type { AssistantEvidence } from "@/domains/assistant/types";

export type ExternalEvidenceSourceType =
  | "web_page"
  | "skill_output"
  | "external_document"
  | "manufacturer_doc"
  | "public_standard";

export type ExternalEvidencePermissionState = "user_approved";

export type ExternalEvidenceRecord = {
  id: string;
  projectId: string;
  taskId: string;
  sourceType: ExternalEvidenceSourceType;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  toolName?: string;
  permissionState: ExternalEvidencePermissionState;
  capturedAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateExternalEvidenceInput = {
  projectId: string;
  taskId: string;
  createdBy: string;
  sourceType: ExternalEvidenceSourceType;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  toolName?: string;
  permissionState: ExternalEvidencePermissionState;
  capturedAt: string;
};

const sourceTypeLabels: Record<ExternalEvidenceSourceType, string> = {
  web_page: "web page",
  skill_output: "skill output",
  external_document: "external document",
  manufacturer_doc: "manufacturer document",
  public_standard: "public standard",
};

export function isExternalEvidenceSourceType(value: unknown): value is ExternalEvidenceSourceType {
  return (
    value === "web_page" ||
    value === "skill_output" ||
    value === "external_document" ||
    value === "manufacturer_doc" ||
    value === "public_standard"
  );
}

export function formatExternalEvidenceSourceType(sourceType: ExternalEvidenceSourceType) {
  return sourceTypeLabels[sourceType];
}

export function externalEvidenceConfidenceWeight(sourceType: ExternalEvidenceSourceType) {
  if (sourceType === "public_standard") {
    return 0.4;
  }

  if (sourceType === "manufacturer_doc") {
    return 0.34;
  }

  return 0.28;
}

export function externalEvidenceToAssistantEvidence(record: ExternalEvidenceRecord): AssistantEvidence {
  const sourceParts = [formatExternalEvidenceSourceType(record.sourceType), record.toolName].filter(Boolean);
  return {
    id: `external-evidence:${record.id}`,
    kind: "web_or_skill",
    priority: 5,
    title: `${record.title} / ${sourceParts.join(" / ")}`,
    excerpt: record.excerpt,
    sourceUrl: record.sourceUrl,
    recordId: record.id,
    confidenceWeight: externalEvidenceConfidenceWeight(record.sourceType),
  };
}

export function normalizeExternalEvidenceMetadata(value: unknown): ExternalEvidenceRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Partial<ExternalEvidenceRecord>;
  if (
    !source.id ||
    !source.projectId ||
    !source.taskId ||
    !isExternalEvidenceSourceType(source.sourceType) ||
    !source.title ||
    !source.excerpt ||
    source.permissionState !== "user_approved" ||
    !source.createdBy ||
    !source.createdAt ||
    !source.updatedAt
  ) {
    return null;
  }

  return {
    id: source.id,
    projectId: source.projectId,
    taskId: source.taskId,
    sourceType: source.sourceType,
    title: source.title,
    excerpt: source.excerpt,
    sourceUrl: source.sourceUrl || undefined,
    toolName: source.toolName || undefined,
    permissionState: source.permissionState,
    capturedAt: source.capturedAt || source.createdAt,
    createdBy: source.createdBy,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}
