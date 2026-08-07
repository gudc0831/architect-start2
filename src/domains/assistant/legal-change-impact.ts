export type LegalChangeEvidenceInspection = {
  present: boolean;
  stale: boolean;
  warnings: string[];
  malformed: boolean;
  hasImpact: boolean;
  sourceId: string;
};

export function inspectLegalChangeEvidence(value: { legal?: unknown }): LegalChangeEvidenceInspection {
  const legal = value.legal;
  if (legal === undefined || legal === null) {
    return {
      present: false,
      stale: false,
      warnings: [],
      malformed: false,
      hasImpact: false,
      sourceId: "",
    };
  }
  if (typeof legal !== "object" || Array.isArray(legal)) {
    return {
      present: true,
      stale: false,
      warnings: [],
      malformed: true,
      hasImpact: true,
      sourceId: "",
    };
  }

  const metadata = legal as Record<string, unknown>;
  const stale = metadata.stale === true;
  const sourceId = typeof metadata.sourceId === "string" ? metadata.sourceId.trim() : "";
  const rawWarnings = metadata.legalChangeWarnings;
  const malformed =
    !Array.isArray(rawWarnings) ||
    rawWarnings.some((warning) => typeof warning !== "string");
  const warnings = Array.isArray(rawWarnings)
    ? rawWarnings
        .filter((warning): warning is string => typeof warning === "string")
        .map((warning) => warning.trim())
        .filter(Boolean)
    : [];

  return {
    present: true,
    stale,
    warnings,
    malformed,
    hasImpact: stale || warnings.length > 0 || malformed,
    sourceId,
  };
}

export function hasLegalChangeEvidenceImpact(evidence: ReadonlyArray<{ legal?: unknown }>) {
  return evidence.some((item) => inspectLegalChangeEvidence(item).hasImpact);
}
