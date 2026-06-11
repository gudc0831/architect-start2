"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MyAssistantUsageSummary } from "@/domains/assistant/saas-api-mode";
import type { AiSettingsPreference } from "@/domains/preferences/types";
import {
  CODEX_DEFAULT_MODEL,
  DEFAULT_AI_SETTINGS_PREFERENCE,
  sanitizeAiSettingsPreference,
} from "@/domains/preferences/types";
import {
  buildFallbackModelCatalog,
  normalizeModelCatalog,
  normalizeModelOptions,
  type LocalCodexModelCatalog,
} from "@/components/ai-settings/model-catalog-normalization";
import {
  buildCombinedUsageMetrics,
  normalizeLocalCodexUsageSummary,
  type LocalCodexUsageSummary,
} from "@/components/ai-settings/usage-aggregation";
import {
  readLocalUsageCache,
  writeLocalUsageCache,
  type LocalScanRange,
} from "@/components/ai-settings/local-usage-cache";
import { UsageChart } from "@/components/ai-settings/usage-chart";
import styles from "./ai-settings.module.css";

type AiSettingsClientProps = {
  user: {
    displayName: string;
    email: string;
    role: string;
  };
};

type LocalCodexStatus = {
  available: boolean;
  mode?: "local-chatgpt-codex" | "mock" | "unavailable";
  reason?: string;
  bridgeSchemaVersion?: number;
  codexCliVersion?: string;
  checkedAt?: string;
};

type LoadState = "idle" | "loading" | "ready" | "failed";

export function AiSettingsClient({ user }: AiSettingsClientProps) {
  const [preference, setPreference] = useState<AiSettingsPreference>(DEFAULT_AI_SETTINGS_PREFERENCE);
  const [savedPreference, setSavedPreference] = useState<AiSettingsPreference>(DEFAULT_AI_SETTINGS_PREFERENCE);
  const [preferenceState, setPreferenceState] = useState<LoadState>("loading");
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [serviceUsage, setServiceUsage] = useState<MyAssistantUsageSummary | null>(null);
  const [serviceUsageState, setServiceUsageState] = useState<LoadState>("loading");
  const [localStatus, setLocalStatus] = useState<LocalCodexStatus | null>(null);
  const [localStatusState, setLocalStatusState] = useState<LoadState>("idle");
  const [modelCatalog, setModelCatalog] = useState<LocalCodexModelCatalog | null>(null);
  const [modelCatalogState, setModelCatalogState] = useState<LoadState>("idle");
  const [modelCatalogMessage, setModelCatalogMessage] = useState("");
  const [localScanEnabled, setLocalScanEnabled] = useState(false);
  const [localRange, setLocalRange] = useState<LocalScanRange>(30);
  const [localUsage, setLocalUsage] = useState<LocalCodexUsageSummary | null>(null);
  const [localUsageState, setLocalUsageState] = useState<LoadState>("idle");
  const [localUsageMessage, setLocalUsageMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPreferenceState("loading");
    fetch("/api/preferences/ai-settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const nextPreference = sanitizeAiSettingsPreference(payload.data);
        setPreference(nextPreference);
        setSavedPreference(nextPreference);
        setLocalRange(nextPreference.aiLocalUsageDefaultRangeDays);
        setPreferenceState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setPreferenceState("failed");
          setPreferenceMessage("개인 AI 설정을 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshModelCatalog(preference.aiDefaultModel);
    }, 350);

    return () => window.clearTimeout(timer);
    // Initial refresh should use the saved preference loaded from the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPreference.aiDefaultModel]);

  useEffect(() => {
    let cancelled = false;
    setServiceUsageState("loading");
    fetch("/api/assistant/usage/me?range=30d&granularity=day", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setServiceUsage(payload.data ?? null);
        setServiceUsageState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setServiceUsageState("failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalStatusState("loading");
      requestLocalRuntime<LocalCodexStatus>("status", undefined, 5000)
        .then((status) => {
          setLocalStatus({ ...status, checkedAt: new Date().toISOString() });
          setLocalStatusState("ready");
        })
        .catch((error) => {
          setLocalStatus({ available: false, reason: errorMessage(error), checkedAt: new Date().toISOString() });
          setLocalStatusState("failed");
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, []);

  const runLocalScan = useCallback(async (range: LocalScanRange, force = false) => {
    if (!localScanEnabled) {
      return;
    }

    if (!force) {
      const cached = readLocalUsageCache(window.sessionStorage, range);
      if (cached) {
        setLocalUsage(cached);
        setLocalUsageState("ready");
        setLocalUsageMessage("sessionStorage 캐시");
        return;
      }
    }

    setLocalUsageState("loading");
    setLocalUsageMessage("");
    try {
      const data = await requestLocalRuntime<unknown>("usage-summary", { rangeDays: range }, scanTimeoutMs(range));
      const summary = normalizeLocalCodexUsageSummary(data, range);
      if (!summary) {
        throw new Error("로컬 Codex 사용량 요약을 읽지 못했습니다.");
      }
      writeLocalUsageCache(window.sessionStorage, range, summary);
      setLocalUsage(summary);
      setLocalUsageState("ready");
      setLocalUsageMessage("현재 브라우저 세션");
    } catch (error) {
      setLocalUsageState("failed");
      setLocalUsageMessage(errorMessage(error));
    }
  }, [localScanEnabled]);

  useEffect(() => {
    if (!localScanEnabled) {
      return;
    }

    const cached = readLocalUsageCache(window.sessionStorage, localRange);
    if (cached) {
      setLocalUsage(cached);
      setLocalUsageState("ready");
      setLocalUsageMessage("sessionStorage 캐시");
      return;
    }

    void runLocalScan(localRange);
  }, [localRange, localScanEnabled, runLocalScan]);

  const combinedUsage = useMemo(() => buildCombinedUsageMetrics(serviceUsage, localUsage), [localUsage, serviceUsage]);
  const preferenceDirty = JSON.stringify(preference) !== JSON.stringify(savedPreference);

  async function savePreference() {
    setPreferenceState("loading");
    setPreferenceMessage("");
    try {
      const response = await fetch("/api/preferences/ai-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preference),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "개인 AI 설정을 저장하지 못했습니다.");
      }
      const nextPreference = sanitizeAiSettingsPreference(payload.data);
      setPreference(nextPreference);
      setSavedPreference(nextPreference);
      setPreferenceState("ready");
      setPreferenceMessage("저장됨");
    } catch (error) {
      setPreferenceState("failed");
      setPreferenceMessage(errorMessage(error));
    }
  }

  async function refreshModelCatalog(savedModel = preference.aiDefaultModel) {
    setModelCatalogState("loading");
    setModelCatalogMessage("");
    try {
      const catalog = await requestLocalRuntime<LocalCodexModelCatalog>(
        "model-catalog",
        { savedModel },
        5000,
      );
      setModelCatalog(normalizeModelCatalog(catalog, savedModel));
      setModelCatalogState("ready");
    } catch (error) {
      setModelCatalog(buildFallbackModelCatalog(savedModel));
      setModelCatalogState("failed");
      setModelCatalogMessage(errorMessage(error));
    }
  }

  const modelOptions = useMemo(
    () => normalizeModelOptions(modelCatalog, preference.aiDefaultModel),
    [modelCatalog, preference.aiDefaultModel],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Personal AI</p>
          <h1>AI settings</h1>
          <span>
            {user.displayName} · {user.email} · {user.role}
          </span>
        </div>
        <div className={styles.headerStatus}>
          <StatusPill state={localStatus?.available ? "on" : "off"} label={localStatusLabel(localStatus, localStatusState)} />
        </div>
      </header>

      <section className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>개인 전역 설정</h2>
              <p>작업 assistant가 Local Codex를 호출할 때 적용하는 기본값입니다.</p>
            </div>
            <StatusPill state={preferenceDirty ? "pending" : "on"} label={preferenceDirty ? "변경됨" : "저장됨"} />
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>모델</span>
              <div className={styles.modelControlRow}>
                <select
                  value={preference.aiDefaultModel || CODEX_DEFAULT_MODEL}
                  onChange={(event) =>
                    setPreference((current) =>
                      sanitizeAiSettingsPreference({ ...current, aiDefaultModel: event.target.value }),
                    )
                  }
                >
                  {modelOptions.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                      {model.available ? "" : " (사용자 지정 값)"}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.secondaryButton}
                  disabled={modelCatalogState === "loading"}
                  onClick={() => void refreshModelCatalog()}
                  type="button"
                >
                  새로고침
                </button>
              </div>
              <small className={styles.modelCatalogStatus}>
                {formatModelCatalogStatus(modelCatalog, modelCatalogState, modelCatalogMessage)}
              </small>
            </label>
            <label className={styles.field}>
              <span>Reasoning</span>
              <select
                value={preference.aiReasoningEffort}
                onChange={(event) =>
                  setPreference((current) =>
                    sanitizeAiSettingsPreference({ ...current, aiReasoningEffort: event.target.value }),
                  )
                }
              >
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Service tier</span>
              <select
                value={preference.aiServiceTier}
                onChange={(event) =>
                  setPreference((current) => sanitizeAiSettingsPreference({ ...current, aiServiceTier: event.target.value }))
                }
              >
                <option value="auto">auto</option>
                <option value="default">default</option>
                <option value="priority">priority</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Timeout</span>
              <input
                min={30000}
                max={120000}
                step={5000}
                type="number"
                value={preference.aiRequestTimeoutMs}
                onChange={(event) =>
                  setPreference((current) =>
                    sanitizeAiSettingsPreference({ ...current, aiRequestTimeoutMs: Number(event.target.value) }),
                  )
                }
              />
            </label>
            <label className={styles.field}>
              <span>Local usage 기본 범위</span>
              <select
                value={preference.aiLocalUsageDefaultRangeDays}
                onChange={(event) =>
                  setPreference((current) =>
                    sanitizeAiSettingsPreference({
                      ...current,
                      aiLocalUsageDefaultRangeDays: Number(event.target.value),
                    }),
                  )
                }
              >
                <option value={30}>최근 30일</option>
                <option value={90}>최근 90일</option>
                <option value={0}>전체</option>
              </select>
            </label>
            <label className={styles.toggleField}>
              <input
                checked={preference.aiLocalCodexNoHistory}
                onChange={(event) =>
                  setPreference((current) =>
                    sanitizeAiSettingsPreference({ ...current, aiLocalCodexNoHistory: event.target.checked }),
                  )
                }
                type="checkbox"
              />
              <span>
                <strong>Local Codex 기록 저장 안 함</strong>
                <small>켜면 AI 검토 실행 시 Local Codex를 ephemeral 모드로 호출합니다. 이전 기록은 삭제하지 않습니다.</small>
              </span>
            </label>
          </div>

          <div className={styles.actions}>
            <button disabled={!preferenceDirty || preferenceState === "loading"} onClick={() => void savePreference()} type="button">
              저장
            </button>
            <span aria-live="polite">{preferenceMessage || (preferenceState === "loading" ? "처리 중" : "")}</span>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Local Codex 상태</h2>
              <p>{localStatusDetail(localStatus, localStatusState)}</p>
            </div>
            <button className={styles.secondaryButton} onClick={() => refreshLocalStatus(setLocalStatus, setLocalStatusState)} type="button">
              상태 확인
            </button>
          </div>

          <dl className={styles.definitionGrid}>
            <div>
              <dt>Bridge schema</dt>
              <dd>{localStatus?.bridgeSchemaVersion ?? "-"}</dd>
            </div>
            <div>
              <dt>Codex CLI</dt>
              <dd>{localStatus?.codexCliVersion ?? "-"}</dd>
            </div>
            <div>
              <dt>확인 시각</dt>
              <dd>{localStatus?.checkedAt ? formatDateTime(localStatus.checkedAt) : "-"}</dd>
            </div>
          </dl>
        </section>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>AI 사용량</h2>
            <p>SaaS 사용량은 서버 기록, Local Codex 전체 사용량은 선택 시 브라우저 세션에만 보관됩니다.</p>
          </div>
          <StatusPill state={serviceUsageState === "failed" ? "off" : "on"} label={serviceUsageStateLabel(serviceUsageState)} />
        </div>

        <div className={styles.metricGrid}>
          <Metric label="SaaS tokens" value={combinedUsage.serviceTotalTokens} />
          <Metric label="Local direct tokens" value={combinedUsage.localDirectTotalTokens} />
          <Metric label="Combined certain" value={combinedUsage.combinedCertainTotalTokens} />
          <Metric label="Local uncertain" value={combinedUsage.localUncertainTotalTokens} />
        </div>

        <UsageChart buckets={combinedUsage.buckets} />

        <div className={styles.localScan}>
          <label className={styles.toggle}>
            <span>
              Local Codex 사용량 scan
              <small>초기 로딩에는 실행하지 않습니다.</small>
            </span>
            <input
              checked={localScanEnabled}
              onChange={(event) => {
                setLocalScanEnabled(event.target.checked);
                if (!event.target.checked) {
                  setLocalUsage(null);
                  setLocalUsageState("idle");
                  setLocalUsageMessage("");
                }
              }}
              type="checkbox"
            />
          </label>
          {localScanEnabled ? (
            <div className={styles.scanControls}>
              <label>
                <span>범위</span>
                <select value={localRange} onChange={(event) => setLocalRange(Number(event.target.value) as LocalScanRange)}>
                  <option value={30}>최근 30일</option>
                  <option value={90}>최근 90일</option>
                  <option value={0}>전체</option>
                </select>
              </label>
              <button
                className={styles.secondaryButton}
                disabled={localUsageState === "loading"}
                onClick={() => void runLocalScan(localRange, true)}
                type="button"
              >
                다시 scan
              </button>
              <span aria-live="polite">{localUsageState === "loading" ? "scan 중" : localUsageMessage}</span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function StatusPill({ label, state }: { label: string; state: "on" | "off" | "pending" }) {
  return <span className={`${styles.statusPill} ${styles[`statusPill_${state}`]}`}>{label}</span>;
}

function formatModelCatalogStatus(
  catalog: LocalCodexModelCatalog | null,
  state: LoadState,
  message: string,
) {
  if (state === "loading") {
    return "모델 목록을 새로고치는 중입니다.";
  }

  if (!catalog) {
    return "모델 목록 새로고침 전입니다.";
  }

  const cli = catalog.codexCliVersion ? `Codex CLI ${catalog.codexCliVersion} 확인됨` : "Codex CLI 버전 미확인";
  const refreshed = `마지막 갱신: ${formatDateTime(catalog.refreshedAt)}`;
  const source = `목록 출처: ${catalog.source === "local-codex-bridge" ? "Local Codex bridge" : "fallback catalog"}`;
  return [cli, refreshed, source, message].filter(Boolean).join(" · ");
}

function serviceUsageStateLabel(state: LoadState) {
  if (state === "loading") {
    return "불러오는 중";
  }
  if (state === "failed") {
    return "오류";
  }
  return "metadata only";
}

function localStatusLabel(status: LocalCodexStatus | null, state: LoadState) {
  if (state === "loading") {
    return "확인 중";
  }
  if (status?.available) {
    return "연결됨";
  }
  if (state === "idle") {
    return "확인 대기";
  }
  return "연결 안 됨";
}

function localStatusDetail(status: LocalCodexStatus | null, state: LoadState) {
  if (state === "loading") {
    return "native bridge 상태를 확인하는 중입니다.";
  }
  if (status?.available) {
    return status.mode === "mock" ? "mock runtime이 응답했습니다." : "Local Codex bridge가 응답했습니다.";
  }
  if (status?.reason) {
    return status.reason;
  }
  return "상태 확인 전입니다.";
}

function refreshLocalStatus(
  setLocalStatus: (status: LocalCodexStatus) => void,
  setLocalStatusState: (state: LoadState) => void,
) {
  setLocalStatusState("loading");
  requestLocalRuntime<LocalCodexStatus>("status", undefined, 5000)
    .then((status) => {
      setLocalStatus({ ...status, checkedAt: new Date().toISOString() });
      setLocalStatusState("ready");
    })
    .catch((error) => {
      setLocalStatus({ available: false, reason: errorMessage(error), checkedAt: new Date().toISOString() });
      setLocalStatusState("failed");
    });
}

function requestLocalRuntime<T>(command: string, input: unknown, timeoutMs: number): Promise<T> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저 환경이 아닙니다."));
  }

  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new Error("Architect Browser Assistant bridge가 응답하지 않았습니다."));
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const response = event.data as {
        type?: string;
        requestId?: string;
        ok?: boolean;
        data?: T;
        error?: string;
      };

      if (response.type !== "architect:page-local-runtime-response" || response.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);

      if (response.ok) {
        resolve(response.data as T);
        return;
      }

      reject(new Error(response.error ?? "Local runtime 요청이 실패했습니다."));
    }

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        type: "architect:page-local-runtime-request",
        requestId,
        command,
        input,
      },
      window.location.origin,
    );
  });
}

function scanTimeoutMs(range: LocalScanRange) {
  if (range === 0) {
    return 120000;
  }
  return range === 90 ? 60000 : 30000;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청이 실패했습니다.";
}
