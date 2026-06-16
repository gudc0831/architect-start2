import { useEffect, useMemo, useState } from "react";
import {
  knowledgeSourceKinds,
  type KnowledgeGenerationProfile,
  type KnowledgeSourceKind,
  type KnowledgeTocItem,
  type StructuredKnowledgeDraft,
} from "@/domains/knowledge/structured-knowledge";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

type KnowledgeGenerationProfilePanelProps = {
  profiles: KnowledgeGenerationProfile[];
  loading: boolean;
  error: string;
  selectedCandidateId: string;
  selectedCandidateTitle: string;
  onRefresh: () => Promise<KnowledgeGenerationProfile[]>;
};

type ProfileDraftFields = {
  sourceBucketRules: Record<KnowledgeSourceKind, { required: boolean; maxItems: number }>;
  tocTemplate: KnowledgeTocItem[];
  ontologySchema: Record<string, unknown>;
  citationRules: string[];
  sectionRules: string[];
};

type JsonParseResult<T> = {
  value: T | null;
  error: string;
};

type StructuredDraftDryRunResult = {
  draft: StructuredKnowledgeDraft;
  generationRunId: string;
  profileId: string;
  profileVersion: number;
  warnings: string[];
};

const profileStateLabels: Record<KnowledgeGenerationProfile["state"], string> = {
  active: "active / 활성",
  archived: "archived / 보관",
  draft: "draft / 초안",
};

export function KnowledgeGenerationProfilePanel({
  profiles,
  loading,
  error,
  selectedCandidateId,
  selectedCandidateTitle,
  onRefresh,
}: KnowledgeGenerationProfilePanelProps) {
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.state === "active") ?? null,
    [profiles],
  );
  const draftProfiles = useMemo(
    () => profiles.filter((profile) => profile.state === "draft"),
    [profiles],
  );
  const archivedProfiles = useMemo(
    () => profiles.filter((profile) => profile.state === "archived"),
    [profiles],
  );

  const [profileName, setProfileName] = useState("");
  const [sourceBucketRulesJson, setSourceBucketRulesJson] = useState("{}");
  const [tocTemplateJson, setTocTemplateJson] = useState("[]");
  const [ontologySchemaJson, setOntologySchemaJson] = useState("{}");
  const [citationRulesJson, setCitationRulesJson] = useState("[]");
  const [sectionRulesJson, setSectionRulesJson] = useState("[]");
  const [activationProfileId, setActivationProfileId] = useState("");
  const [activationConfirmation, setActivationConfirmation] = useState("");
  const [rollbackProfileId, setRollbackProfileId] = useState("");
  const [rollbackConfirmation, setRollbackConfirmation] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [operationStatus, setOperationStatus] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [activating, setActivating] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<StructuredDraftDryRunResult | null>(null);

  useEffect(() => {
    if (!activeProfile) {
      return;
    }
    setProfileName(activeProfile.name);
    setSourceBucketRulesJson(formatJson(activeProfile.sourceBucketRules));
    setTocTemplateJson(formatJson(activeProfile.tocTemplate));
    setOntologySchemaJson(formatJson(activeProfile.ontologySchema));
    setCitationRulesJson(formatJson(activeProfile.citationRules));
    setSectionRulesJson(formatJson(activeProfile.sectionRules));
  }, [activeProfile]);

  useEffect(() => {
    if (activationProfileId && draftProfiles.some((profile) => profile.id === activationProfileId)) {
      return;
    }
    setActivationProfileId(draftProfiles[0]?.id ?? "");
    setActivationConfirmation("");
  }, [activationProfileId, draftProfiles]);

  useEffect(() => {
    if (rollbackProfileId && archivedProfiles.some((profile) => profile.id === rollbackProfileId)) {
      return;
    }
    setRollbackProfileId(archivedProfiles[0]?.id ?? "");
    setRollbackConfirmation("");
  }, [archivedProfiles, rollbackProfileId]);

  const parsedSourceBucketRules = useMemo(
    () => parseSourceBucketRules(sourceBucketRulesJson),
    [sourceBucketRulesJson],
  );
  const parsedTocTemplate = useMemo(
    () => parseJsonArray<KnowledgeTocItem>(tocTemplateJson, "tocTemplate"),
    [tocTemplateJson],
  );
  const parsedOntologySchema = useMemo(
    () => parseJsonRecord(ontologySchemaJson, "ontologySchema"),
    [ontologySchemaJson],
  );
  const parsedCitationRules = useMemo(
    () => parseStringArray(citationRulesJson, "citationRules"),
    [citationRulesJson],
  );
  const parsedSectionRules = useMemo(
    () => parseStringArray(sectionRulesJson, "sectionRules"),
    [sectionRulesJson],
  );

  const parseErrors = [
    parsedSourceBucketRules.error,
    parsedTocTemplate.error,
    parsedOntologySchema.error,
    parsedCitationRules.error,
    parsedSectionRules.error,
  ].filter(Boolean);
  const draftFields = useMemo<ProfileDraftFields | null>(() => {
    if (
      !parsedSourceBucketRules.value ||
      !parsedTocTemplate.value ||
      !parsedOntologySchema.value ||
      !parsedCitationRules.value ||
      !parsedSectionRules.value
    ) {
      return null;
    }
    return {
      sourceBucketRules: parsedSourceBucketRules.value,
      tocTemplate: parsedTocTemplate.value,
      ontologySchema: parsedOntologySchema.value,
      citationRules: parsedCitationRules.value,
      sectionRules: parsedSectionRules.value,
    };
  }, [
    parsedCitationRules.value,
    parsedOntologySchema.value,
    parsedSectionRules.value,
    parsedSourceBucketRules.value,
    parsedTocTemplate.value,
  ]);
  const activationProfile = draftProfiles.find((profile) => profile.id === activationProfileId) ?? null;
  const rollbackTargetProfile = archivedProfiles.find((profile) => profile.id === rollbackProfileId) ?? null;
  const activationConfirmationText = activationProfile
    ? `ACTIVATE ${activationProfile.name} v${activationProfile.version}`
    : "ACTIVATE";
  const rollbackConfirmationText = rollbackTargetProfile
    ? `ROLLBACK ${rollbackTargetProfile.name} v${rollbackTargetProfile.version}`
    : "ROLLBACK";
  const canCreateDraft = Boolean(activeProfile && draftFields && !parseErrors.length && !creatingDraft);
  const canActivate = Boolean(
    activationProfile &&
      activationConfirmation === activationConfirmationText &&
      !activating,
  );
  const canRollback = Boolean(
    rollbackTargetProfile &&
      rollbackConfirmation === rollbackConfirmationText &&
      rollbackReason.trim() &&
      !rollingBack,
  );

  const editorImpactSummary = draftFields ? readImpactSummary(draftFields) : null;
  const activationProfileFields = activationProfile ? pickProfileFields(activationProfile) : null;
  const activationImpactSummary = activationProfileFields ? readImpactSummary(activationProfileFields) : null;
  const impactSummary = activationImpactSummary ?? editorImpactSummary;
  const diffTargetFields = activationProfileFields ?? draftFields;
  const diffTargetLabel = activationProfile
    ? `selected activation draft ${activationProfile.name} v${activationProfile.version}`
    : "current editor draft";
  const diffPreview = activeProfile && diffTargetFields
    ? createProfileDiffPreview(activeProfile, diffTargetFields, diffTargetLabel)
    : "JSON parse errors must be resolved before before/after diff preview can be calculated.";

  async function createDraftProfile() {
    if (!draftFields) {
      setOperationStatus("JSON parse errors must be fixed before creating a profile draft.");
      return;
    }
    setCreatingDraft(true);
    setOperationStatus("Creating generation profile draft.");
    try {
      const profile = await writeJson<KnowledgeGenerationProfile>("/api/admin/knowledge/generation-profiles", {
        name: profileName.trim() || activeProfile?.name || "approved-wiki-generation-profile",
        ...draftFields,
      });
      setActivationProfileId(profile.id);
      setActivationConfirmation("");
      await onRefresh();
      setOperationStatus(
        `Server route result: draft ${profile.name} v${profile.version} created. Audit status: generation profile draft audit recorded by the server route.`,
      );
    } catch (createError) {
      setOperationStatus(createError instanceof Error ? createError.message : "Failed to create generation profile draft.");
    } finally {
      setCreatingDraft(false);
    }
  }

  async function activateProfile() {
    if (!activationProfile) {
      setOperationStatus("Select a draft generation profile before activation.");
      return;
    }
    setActivating(true);
    setOperationStatus("Activating generation profile draft.");
    try {
      const profile = await writeJson<KnowledgeGenerationProfile>(
        `/api/admin/knowledge/generation-profiles/${activationProfile.id}/activate`,
        {},
      );
      await onRefresh();
      setActivationConfirmation("");
      setOperationStatus(
        `Server route result: active profile is ${profile.name} v${profile.version}. Audit status: activation audit recorded by the server route.`,
      );
    } catch (activateError) {
      setOperationStatus(activateError instanceof Error ? activateError.message : "Failed to activate generation profile.");
    } finally {
      setActivating(false);
    }
  }

  async function rollbackProfile() {
    if (!rollbackTargetProfile) {
      setOperationStatus("Select an archived generation profile before rollback.");
      return;
    }
    setRollingBack(true);
    setOperationStatus("Rolling back generation profile.");
    try {
      const profile = await writeJson<KnowledgeGenerationProfile>(
        `/api/admin/knowledge/generation-profiles/${rollbackTargetProfile.id}/rollback`,
        { reason: rollbackReason.trim() },
      );
      await onRefresh();
      setRollbackConfirmation("");
      setRollbackReason("");
      setOperationStatus(
        `Server route result: rolled back to ${profile.name} v${profile.version}. Audit status: rollback reason was sent to the server audit route.`,
      );
    } catch (rollbackError) {
      setOperationStatus(rollbackError instanceof Error ? rollbackError.message : "Failed to roll back generation profile.");
    } finally {
      setRollingBack(false);
    }
  }

  async function runSelectedCandidateDryRun() {
    if (!selectedCandidateId) {
      setOperationStatus("Select a candidate before running a sample dry-run.");
      return;
    }
    setDryRunLoading(true);
    setDryRunResult(null);
    setOperationStatus("Running selected candidate sample dry-run with the active server profile.");
    try {
      const result = await writeJson<StructuredDraftDryRunResult>(
        `/api/admin/knowledge/candidates/${selectedCandidateId}/structured-draft`,
        {},
      );
      setDryRunResult(result);
      setOperationStatus(
        `Sample dry-run finished: ${result.draft.approvalReadiness.status}, warnings ${result.draft.warnings.length + result.warnings.length}. No generation profile was activated.`,
      );
    } catch (dryRunError) {
      setOperationStatus(dryRunError instanceof Error ? dryRunError.message : "Selected candidate sample dry-run failed.");
    } finally {
      setDryRunLoading(false);
    }
  }

  return (
    <section className={styles.generationProfilePanel} aria-label="Generation profile admin UI">
      <div className={styles.structuredDraftHeader}>
        <div>
          <p>Generation profile</p>
          <h3>승인 WIKI 구조 생성 지침</h3>
        </div>
        <button disabled={loading} onClick={() => { void onRefresh(); }} type="button">
          프로필 새로고침
        </button>
      </div>
      <p className={styles.empty}>
        Generation profiles are generation instructions for approved WIKI structure. They do not change local login, user policy, route authorization, or project membership.
      </p>
      {error ? <p className={styles.structuredError}>{error}</p> : null}
      <section className={styles.profileSummaryGrid} aria-label="active profile summary">
        {activeProfile ? (
          <>
            <ProfileMetric label="active profile name" value={activeProfile.name} />
            <ProfileMetric label="version" value={`v${activeProfile.version}`} />
            <ProfileMetric label="state" value={profileStateLabels[activeProfile.state]} />
            <ProfileMetric label="TOC template count" value={`${activeProfile.tocTemplate.length}`} />
            <ProfileMetric label="citation rule count" value={`${activeProfile.citationRules.length}`} />
            <ProfileMetric label="section rule count" value={`${activeProfile.sectionRules.length}`} />
            <ProfileMetric label="last updated" value={formatDate(activeProfile.updatedAt)} />
          </>
        ) : (
          <p className={styles.empty}>Active generation profile is not loaded yet.</p>
        )}
      </section>
      <section className={styles.profileEditorGrid} aria-label="generation profile draft edit surface">
        <label>
          profile name
          <input
            onChange={(event) => setProfileName(event.target.value)}
            value={profileName}
          />
        </label>
        <JsonEditor
          error={parsedSourceBucketRules.error}
          label="sourceBucketRules JSON editor"
          onChange={setSourceBucketRulesJson}
          value={sourceBucketRulesJson}
        />
        <JsonEditor
          error={parsedTocTemplate.error}
          label="tocTemplate JSON editor"
          onChange={setTocTemplateJson}
          value={tocTemplateJson}
        />
        <JsonEditor
          error={parsedOntologySchema.error}
          label="ontologySchema JSON editor"
          onChange={setOntologySchemaJson}
          value={ontologySchemaJson}
        />
        <JsonEditor
          error={parsedCitationRules.error}
          label="citationRules JSON editor"
          onChange={setCitationRulesJson}
          value={citationRulesJson}
        />
        <JsonEditor
          error={parsedSectionRules.error}
          label="sectionRules JSON editor"
          onChange={setSectionRulesJson}
          value={sectionRulesJson}
        />
      </section>
      {parseErrors.length ? (
        <div className={styles.syncWarnings} aria-label="JSON parse error label">
          {parseErrors.map((parseError) => <span key={parseError}>JSON parse error: {parseError}</span>)}
        </div>
      ) : null}
      <section className={styles.profileImpactGrid} aria-label="activation impact summary">
        <div>
          <strong>activation impact summary</strong>
          <span>impact target {activationProfile ? `selected draft v${activationProfile.version}` : "current editor draft"}</span>
          <span>source bucket rules {impactSummary?.sourceBucketRules ?? 0}</span>
          <span>required source buckets {impactSummary?.requiredSourceBuckets ?? 0}</span>
          <span>TOC template count {impactSummary?.tocTemplateCount ?? 0}</span>
          <span>ontology schema keys {impactSummary?.ontologySchemaKeys ?? 0}</span>
          <span>citation rule count {impactSummary?.citationRuleCount ?? 0}</span>
          <span>section rule count {impactSummary?.sectionRuleCount ?? 0}</span>
        </div>
        <div>
          <strong>selected candidate sample</strong>
          <span>{selectedCandidateTitle || "후보 미선택"}</span>
          <button disabled={!selectedCandidateId || dryRunLoading} onClick={runSelectedCandidateDryRun} type="button">
            {dryRunLoading ? "dry-run 실행 중" : "selected candidate sample dry-run"}
          </button>
        </div>
      </section>
      {dryRunResult ? (
        <section className={styles.providerPreview} aria-label="sample dry-run result">
          <strong>{dryRunResult.draft.title}</strong>
          <p>
            generation result: readiness {dryRunResult.draft.approvalReadiness.status}, profile v{dryRunResult.profileVersion},
            TOC {dryRunResult.draft.toc.length}, sections {dryRunResult.draft.sections.length}
          </p>
          <div>
            {[...dryRunResult.draft.warnings, ...dryRunResult.warnings].slice(0, 6).map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
            {dryRunResult.draft.warnings.length + dryRunResult.warnings.length === 0 ? <span>warnings 0</span> : null}
          </div>
        </section>
      ) : null}
      <section className={styles.profileDiff} aria-label="before/after diff preview">
        <div className={styles.markdownPreviewHeader}>
          <h4>before/after diff preview</h4>
          <button disabled={!canCreateDraft} onClick={createDraftProfile} type="button">
            {creatingDraft ? "초안 생성 중" : "프로필 초안 생성"}
          </button>
        </div>
        <pre>{diffPreview}</pre>
      </section>
      <section className={styles.profileControls} aria-label="activation and rollback controls">
        <div className={styles.reviewNoteForm} aria-label="activation confirmation controls">
          <label>
            활성화할 draft
            <select onChange={(event) => setActivationProfileId(event.target.value)} value={activationProfileId}>
              {draftProfiles.length ? draftProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name} v{profile.version}</option>
              )) : <option value="">draft 없음</option>}
            </select>
          </label>
          <label>
            activation confirmation
            <input
              onChange={(event) => setActivationConfirmation(event.target.value)}
              placeholder={activationConfirmationText}
              value={activationConfirmation}
            />
          </label>
          <button disabled={!canActivate} onClick={activateProfile} type="button">
            {activating ? "활성화 중" : "프로필 활성화"}
          </button>
        </div>
        <div className={styles.reviewNoteForm} aria-label="rollback confirmation controls">
          <label>
            롤백할 archived profile
            <select onChange={(event) => setRollbackProfileId(event.target.value)} value={rollbackProfileId}>
              {archivedProfiles.length ? archivedProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name} v{profile.version}</option>
              )) : <option value="">archived 없음</option>}
            </select>
          </label>
          <label>
            rollback confirmation
            <input
              onChange={(event) => setRollbackConfirmation(event.target.value)}
              placeholder={rollbackConfirmationText}
              value={rollbackConfirmation}
            />
          </label>
          <label>
            rollback reason
            <input
              onChange={(event) => setRollbackReason(event.target.value)}
              placeholder="예: 새 구조 규칙이 승인 WIKI 품질을 낮춤"
              value={rollbackReason}
            />
          </label>
          <button disabled={!canRollback} onClick={rollbackProfile} type="button">
            {rollingBack ? "롤백 중" : "프로필 롤백"}
          </button>
        </div>
      </section>
      <p className={styles.statusLine} aria-label="server route result audit status message">
        {operationStatus || (loading ? "Generation profiles are loading." : "Generation profile route result will appear here.")}
      </p>
    </section>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JsonEditor({
  error,
  label,
  onChange,
  value,
}: {
  error: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      {label}
      <textarea
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        value={value}
      />
      {error ? <span className={styles.inlineError}>JSON parse error: {error}</span> : null}
    </label>
  );
}

function parseJsonArray<T>(source: string, label: string): JsonParseResult<T[]> {
  const parsed = parseJson(source, label);
  if (parsed.error) {
    return { value: null, error: parsed.error };
  }
  if (!Array.isArray(parsed.value)) {
    return { value: null, error: `${label} must be a JSON array.` };
  }
  return { value: parsed.value as T[], error: "" };
}

function parseStringArray(source: string, label: string): JsonParseResult<string[]> {
  const parsed = parseJsonArray<unknown>(source, label);
  if (parsed.error) {
    return { value: null, error: parsed.error };
  }
  const invalid = parsed.value?.find((item) => typeof item !== "string");
  if (invalid !== undefined) {
    return { value: null, error: `${label} must contain only strings.` };
  }
  return { value: (parsed.value ?? []) as string[], error: "" };
}

function parseJsonRecord(source: string, label: string): JsonParseResult<Record<string, unknown>> {
  const parsed = parseJson(source, label);
  if (parsed.error) {
    return { value: null, error: parsed.error };
  }
  if (!isRecord(parsed.value)) {
    return { value: null, error: `${label} must be a JSON object.` };
  }
  return { value: parsed.value, error: "" };
}

function parseSourceBucketRules(
  source: string,
): JsonParseResult<Record<KnowledgeSourceKind, { required: boolean; maxItems: number }>> {
  const parsed = parseJsonRecord(source, "sourceBucketRules");
  if (parsed.error || !parsed.value) {
    return { value: null, error: parsed.error };
  }
  for (const sourceKind of knowledgeSourceKinds) {
    const rule = parsed.value[sourceKind];
    if (!isRecord(rule) || typeof rule.required !== "boolean" || typeof rule.maxItems !== "number") {
      return { value: null, error: `sourceBucketRules.${sourceKind} requires required:boolean and maxItems:number.` };
    }
  }
  return {
    value: parsed.value as Record<KnowledgeSourceKind, { required: boolean; maxItems: number }>,
    error: "",
  };
}

function parseJson(source: string, label: string): JsonParseResult<unknown> {
  try {
    return { value: JSON.parse(source), error: "" };
  } catch (parseError) {
    return {
      value: null,
      error: `${label}: ${parseError instanceof Error ? parseError.message : "invalid JSON"}`,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readImpactSummary(fields: ProfileDraftFields) {
  return {
    sourceBucketRules: Object.keys(fields.sourceBucketRules).length,
    requiredSourceBuckets: Object.values(fields.sourceBucketRules).filter((rule) => rule.required).length,
    tocTemplateCount: fields.tocTemplate.length,
    ontologySchemaKeys: Object.keys(fields.ontologySchema).length,
    citationRuleCount: fields.citationRules.length,
    sectionRuleCount: fields.sectionRules.length,
  };
}

function createProfileDiffPreview(
  activeProfile: KnowledgeGenerationProfile,
  draftFields: ProfileDraftFields,
  targetLabel: string,
) {
  const before = formatJson(pickProfileFields(activeProfile)).split("\n");
  const after = formatJson(draftFields).split("\n");
  const maxLength = Math.max(before.length, after.length);
  const lines = [`# target: ${targetLabel}`];
  for (let index = 0; index < maxLength; index += 1) {
    const beforeLine = before[index] ?? "";
    const afterLine = after[index] ?? "";
    if (beforeLine === afterLine) {
      lines.push(`  ${beforeLine}`);
    } else {
      if (beforeLine) {
        lines.push(`- ${beforeLine}`);
      }
      if (afterLine) {
        lines.push(`+ ${afterLine}`);
      }
    }
  }
  return lines.join("\n");
}

function pickProfileFields(profile: KnowledgeGenerationProfile): ProfileDraftFields {
  return {
    sourceBucketRules: profile.sourceBucketRules,
    tocTemplate: profile.tocTemplate,
    ontologySchema: profile.ontologySchema,
    citationRules: profile.citationRules,
    sectionRules: profile.sectionRules,
  };
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function writeJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(payload));
  }
  return (payload as { data: T }).data;
}

function readError(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  if (isRecord(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  if (isRecord(payload) && typeof payload.message === "string") {
    return payload.message;
  }
  return "Request failed.";
}
