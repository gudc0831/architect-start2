import type { RegulationSeedPackage } from "@/domains/regulation/knowledge";

export type RegulationGovernanceManifest = {
  schemaVersion: "architect.regulation.governance.v1";
  packageId: string;
  productionImport: {
    enabled: boolean;
    requiredReview: "knowledge_admin";
    blockedReason?: string;
  };
  refreshPolicy: {
    cadenceDays: number;
    staleAfterDays: number;
    ownerRole: "knowledge_admin";
  };
  sources: Array<{
    sourceId: string;
    officialUrl: string;
    refreshDueAt: string;
    verificationChecklist: string[];
  }>;
};

export type RegulationGovernanceValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  refresh: {
    sourceId: string;
    refreshDueAt: string;
    status: "scheduled" | "due" | "overdue";
  }[];
};

export function validateRegulationGovernanceManifest(
  seedPackage: RegulationSeedPackage,
  manifest: unknown,
  options: { asOf?: Date } = {},
): RegulationGovernanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const asOf = options.asOf ?? new Date();

  if (!isRecord(manifest)) {
    return { valid: false, errors: ["Governance manifest must be a JSON object."], warnings, refresh: [] };
  }

  if (readString(manifest.schemaVersion) !== "architect.regulation.governance.v1") {
    errors.push("schemaVersion must be architect.regulation.governance.v1.");
  }
  if (readString(manifest.packageId) !== seedPackage.packageId) {
    errors.push("manifest.packageId must match seed packageId.");
  }

  validateProductionImport(seedPackage, manifest.productionImport, errors, warnings);
  validateRefreshPolicy(manifest.refreshPolicy, errors);

  const manifestSources = Array.isArray(manifest.sources) ? manifest.sources : [];
  const manifestBySourceId = new Map<string, Record<string, unknown>>();
  for (const [index, source] of manifestSources.entries()) {
    if (!isRecord(source)) {
      errors.push(`sources[${index}] must be an object.`);
      continue;
    }
    const sourceId = readString(source.sourceId);
    if (!sourceId) {
      errors.push(`sources[${index}].sourceId is required.`);
      continue;
    }
    if (manifestBySourceId.has(sourceId)) {
      errors.push(`sources[${index}].sourceId must be unique: ${sourceId}.`);
    }
    manifestBySourceId.set(sourceId, source);
  }

  const refresh = seedPackage.sources.map((source) => {
    const governed = manifestBySourceId.get(source.id);
    if (!governed) {
      errors.push(`Governance manifest is missing source ${source.id}.`);
      return { sourceId: source.id, refreshDueAt: "", status: "overdue" as const };
    }

    const officialUrl = readString(governed.officialUrl);
    if (officialUrl !== source.officialUrl) {
      errors.push(`Governance source ${source.id} officialUrl must match seed source officialUrl.`);
    }
    if (!officialUrl.startsWith("https://")) {
      errors.push(`Governance source ${source.id} officialUrl must be https.`);
    }
    if (!readStringArray(governed.verificationChecklist).length) {
      errors.push(`Governance source ${source.id} verificationChecklist is required.`);
    }

    const refreshDueAt = readString(governed.refreshDueAt);
    const status = classifyRefreshStatus(refreshDueAt, asOf);
    if (status === "overdue") {
      errors.push(`Governance source ${source.id} refresh is overdue: ${refreshDueAt}.`);
    } else if (status === "due") {
      warnings.push(`Governance source ${source.id} refresh is due soon: ${refreshDueAt}.`);
    }
    return { sourceId: source.id, refreshDueAt, status };
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    refresh,
  };
}

function validateProductionImport(
  seedPackage: RegulationSeedPackage,
  value: unknown,
  errors: string[],
  warnings: string[],
) {
  if (!isRecord(value)) {
    errors.push("productionImport is required.");
    return;
  }
  if (value.requiredReview !== "knowledge_admin") {
    errors.push("productionImport.requiredReview must be knowledge_admin.");
  }

  const enabled = value.enabled === true;
  const unapproved = seedPackage.documents.filter((document) => document.reviewStatus !== "approved");
  if (enabled && unapproved.length > 0) {
    errors.push(`Production import cannot be enabled while ${unapproved.length} documents still require Knowledge admin review.`);
  }
  if (!enabled && !readString(value.blockedReason)) {
    warnings.push("productionImport.blockedReason should explain why promotion is blocked.");
  }
}

function validateRefreshPolicy(value: unknown, errors: string[]) {
  if (!isRecord(value)) {
    errors.push("refreshPolicy is required.");
    return;
  }
  if (value.ownerRole !== "knowledge_admin") {
    errors.push("refreshPolicy.ownerRole must be knowledge_admin.");
  }
  const cadenceDays = Number(value.cadenceDays);
  const staleAfterDays = Number(value.staleAfterDays);
  if (!Number.isInteger(cadenceDays) || cadenceDays < 7 || cadenceDays > 366) {
    errors.push("refreshPolicy.cadenceDays must be an integer between 7 and 366.");
  }
  if (!Number.isInteger(staleAfterDays) || staleAfterDays < cadenceDays) {
    errors.push("refreshPolicy.staleAfterDays must be an integer greater than or equal to cadenceDays.");
  }
}

function classifyRefreshStatus(refreshDueAt: string, asOf: Date): "scheduled" | "due" | "overdue" {
  const dueAt = parseDate(refreshDueAt);
  if (!dueAt) {
    return "overdue";
  }
  const daysUntilDue = Math.floor((dueAt.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000));
  if (daysUntilDue < 0) {
    return "overdue";
  }
  if (daysUntilDue <= 14) {
    return "due";
  }
  return "scheduled";
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
