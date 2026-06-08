export function isDailyCellDocumentsEnabled() {
  return readBooleanFlag(process.env.NEXT_PUBLIC_DAILY_CELL_DOCUMENTS_ENABLED) || readBooleanFlag(process.env.DAILY_CELL_DOCUMENTS_ENABLED);
}

function readBooleanFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}
