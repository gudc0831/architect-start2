import {
  CODEX_DEFAULT_MODEL,
  WINDOWS_CODEX_MODEL_OPTIONS,
} from "@/domains/preferences/types";

export type LocalCodexModelCatalog = {
  bridgeSchemaVersion: number;
  refreshedAt: string;
  source: "local-codex-bridge" | "fallback-catalog";
  codexCliVersion?: string;
  models: Array<{
    value: string;
    label: string;
    source: "codex-default" | "known-catalog" | "saved-custom";
    available: boolean;
  }>;
  warnings: Array<{
    code: string;
    label: string;
  }>;
};

export function normalizeModelCatalog(catalog: LocalCodexModelCatalog, savedModel: string): LocalCodexModelCatalog {
  const fallback = buildFallbackModelCatalog(savedModel);
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.models)) {
    return fallback;
  }

  const models = catalog.models
    .map((model) => ({
      value: sanitizeModelCatalogValue(model.value),
      label: resolveModelCatalogLabel(model),
      source:
        model.source === "known-catalog" || model.source === "saved-custom" || model.source === "codex-default"
          ? model.source
          : ("known-catalog" as const),
      available: Boolean(model.available),
    }))
    .filter((model) => model.value);

  const mergedModels = normalizeModelOptions(
    {
      ...catalog,
      source: catalog.source === "local-codex-bridge" ? "local-codex-bridge" : "fallback-catalog",
      models,
      warnings: Array.isArray(catalog.warnings) ? catalog.warnings : [],
    },
    savedModel,
  );

  return {
    bridgeSchemaVersion: typeof catalog.bridgeSchemaVersion === "number" ? catalog.bridgeSchemaVersion : fallback.bridgeSchemaVersion,
    refreshedAt: typeof catalog.refreshedAt === "string" ? catalog.refreshedAt : fallback.refreshedAt,
    source: catalog.source === "local-codex-bridge" ? "local-codex-bridge" : "fallback-catalog",
    ...(typeof catalog.codexCliVersion === "string" && catalog.codexCliVersion.trim()
      ? { codexCliVersion: catalog.codexCliVersion.trim() }
      : {}),
    models: mergedModels,
    warnings: Array.isArray(catalog.warnings)
      ? catalog.warnings
          .filter((warning) => warning && typeof warning.code === "string" && typeof warning.label === "string")
          .slice(0, 6)
      : [],
  };
}

export function normalizeModelOptions(catalog: LocalCodexModelCatalog | null, savedModel: string) {
  const models = new Map<string, LocalCodexModelCatalog["models"][number]>();
  const addModel = (model: LocalCodexModelCatalog["models"][number]) => {
    const value = sanitizeModelCatalogValue(model.value);
    if (!value || models.has(value)) {
      return;
    }
    models.set(value, {
      value,
      label: sanitizeModelCatalogLabel(model.label || value) || value,
      source: model.source,
      available: Boolean(model.available),
    });
  };

  catalog?.models.forEach(addModel);
  buildKnownWindowsCodexModelOptions().forEach(addModel);
  const saved = sanitizeModelCatalogValue(savedModel);
  if (saved && !models.has(saved)) {
    addModel({ value: saved, label: saved, source: "saved-custom", available: false });
  }

  return [...models.values()];
}

export function buildFallbackModelCatalog(savedModel: string): LocalCodexModelCatalog {
  return {
    bridgeSchemaVersion: 0,
    refreshedAt: new Date().toISOString(),
    source: "fallback-catalog",
    models: normalizeModelOptions(
      {
        bridgeSchemaVersion: 0,
        refreshedAt: new Date().toISOString(),
        source: "fallback-catalog",
        models: buildKnownWindowsCodexModelOptions(),
        warnings: [],
      },
      savedModel,
    ),
    warnings: [{ code: "bridge_unavailable", label: "Local Codex bridge에서 모델 목록을 읽지 못했습니다." }],
  };
}

function buildKnownWindowsCodexModelOptions(): LocalCodexModelCatalog["models"] {
  return WINDOWS_CODEX_MODEL_OPTIONS.map((model) => ({
    value: model.value,
    label: model.label,
    source: "known-catalog",
    available: true,
  }));
}

function sanitizeModelCatalogValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  const aliased = normalized === "codex-default" || normalized === "gpt-5-codex" ? CODEX_DEFAULT_MODEL : normalized;
  return /^[A-Za-z0-9._:-]{1,80}$/.test(aliased) ? aliased : "";
}

function sanitizeModelCatalogLabel(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return /^[A-Za-z0-9 ._:-]{1,120}$/.test(normalized) ? normalized : "";
}

function resolveModelCatalogLabel(model: LocalCodexModelCatalog["models"][number]) {
  const rawValue = typeof model.value === "string" ? model.value.trim() : "";
  const value = sanitizeModelCatalogValue(model.value);
  const knownLabel = WINDOWS_CODEX_MODEL_OPTIONS.find((option) => option.value === value)?.label;
  const isLegacyDefaultAlias = rawValue === "codex-default" || rawValue === "gpt-5-codex";
  if (knownLabel && (isLegacyDefaultAlias || model.source === "codex-default" || model.label === model.value)) {
    return knownLabel;
  }
  return sanitizeModelCatalogLabel(model.label || knownLabel || value);
}
