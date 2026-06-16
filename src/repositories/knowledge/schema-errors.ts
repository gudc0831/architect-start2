export function isStructuredKnowledgeSchemaUnavailable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "P2021" || code === "P2022") {
    return true;
  }
  const message = error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? "");
  const structuredTable = /knowledge_(items|item_versions|source_references|generation_profiles|generation_runs)/i;
  const missingStructuredRelation =
    /(?:relation|table)\s+["'`]?(?:public["'`]?\.)?["'`]?knowledge_(items|item_versions|source_references|generation_profiles|generation_runs)["'`]?\s+(?:does not exist|not found)/i;
  const missingStructuredColumn =
    /column\s+["'`]?(?:knowledge_(items|item_versions|source_references|generation_profiles|generation_runs)\.)?[A-Za-z0-9_]+["'`]?\s+(?:does not exist|not found)/i;

  return missingStructuredRelation.test(message) ||
    (structuredTable.test(message) && missingStructuredColumn.test(message));
}

export function shouldUseLegacyApprovedKnowledgeFallback(input?: { schemaUnavailable?: boolean }) {
  return input?.schemaUnavailable === true ||
    process.env.STRUCTURED_KNOWLEDGE_LEGACY_READBACK_FALLBACK === "1";
}
