"use client";

import { useEffect, useState } from "react";
import type { AdminProfileSummary, ProjectMembershipRecord } from "@/domains/admin/types";
import {
  taskCategoryFieldKeys,
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { labelForField } from "@/lib/ui-copy";
import { useProjectMeta } from "@/providers/project-provider";

type MembershipPayload = Pick<ProjectMembershipRecord, "profileId" | "displayName" | "email" | "role">;
type CategoryDraft = { code: string; labelKo: string; labelEn: string; sortOrder: string };
type CategoryDefinitionsMap = Record<TaskCategoryFieldKey, TaskCategoryDefinition[]>;
type CategoryDraftMap = Record<TaskCategoryFieldKey, CategoryDraft>;

const emptyCategoryDraft = (): CategoryDraft => ({ code: "", labelKo: "", labelEn: "", sortOrder: "0" });
const emptyCategoryDefinitions = (): CategoryDefinitionsMap =>
  Object.fromEntries(taskCategoryFieldKeys.map((fieldKey) => [fieldKey, [] as TaskCategoryDefinition[]])) as unknown as CategoryDefinitionsMap;
const emptyCategoryDrafts = (): CategoryDraftMap =>
  Object.fromEntries(taskCategoryFieldKeys.map((fieldKey) => [fieldKey, emptyCategoryDraft()])) as unknown as CategoryDraftMap;

const fieldDescription: Partial<Record<TaskCategoryFieldKey, string>> = {
  workType: "DailyTask 작업유형 열에서 선택할 항목을 관리합니다.",
  coordinationScope: "DailyTask 협업범위 열에서 선택할 항목을 관리합니다.",
  relatedDisciplines: "DailyTask 관련분야 열에서 선택할 항목을 관리합니다.",
};

fieldDescription.requestedBy = "DailyTask 요청자 열에서 선택할 항목을 관리합니다.";
fieldDescription.locationRef = "DailyTask 위치참조 열에서 선택할 항목을 관리합니다.";

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const json = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok || !json.data) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data;
}

function describeDefinitionScope(definition: TaskCategoryDefinition) {
  if (definition.projectId) {
    return "(프로젝트)";
  }

  if (definition.isSystem) {
    return "(기본값)";
  }

  return "(공통)";
}

function CategoryRow({
  definition,
  onSave,
}: {
  definition: TaskCategoryDefinition;
  onSave: (next: { labelKo: string; labelEn: string; sortOrder: number; isActive: boolean }) => Promise<void>;
}) {
  const [labelKo, setLabelKo] = useState(definition.labelKo);
  const [labelEn, setLabelEn] = useState(definition.labelEn);
  const [sortOrder, setSortOrder] = useState(String(definition.sortOrder));
  const [isActive, setIsActive] = useState(definition.isActive);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLabelKo(definition.labelKo);
    setLabelEn(definition.labelEn);
    setSortOrder(String(definition.sortOrder));
    setIsActive(definition.isActive);
  }, [definition]);

  return (
    <div style={{ display: "grid", gap: "0.7rem", padding: "0.85rem 0", borderTop: "1px solid rgba(197, 205, 196, 0.7)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <strong>{definition.labelKo || definition.code}</strong>
          <span style={{ color: "var(--muted)", fontSize: "0.84rem" }}>
            코드: <code>{definition.code}</code> {describeDefinitionScope(definition)}
          </span>
        </div>
        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{definition.isActive ? "사용 중" : "비활성"}</span>
      </div>
      <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end" }}>
        <label>
          <span>한글 명칭</span>
          <input value={labelKo} onChange={(event) => setLabelKo(event.target.value)} />
        </label>
        <label>
          <span>영문 명칭</span>
          <input value={labelEn} onChange={(event) => setLabelEn(event.target.value)} />
        </label>
        <label>
          <span>정렬 순서</span>
          <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: "0.45rem" }}>
          <span>사용 여부</span>
          <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="secondary-button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave({ labelKo, labelEn, sortOrder: Number(sortOrder || 0), isActive }).finally(() => setSaving(false));
          }}
          type="button"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  disabled,
  onChange,
  onAdd,
}: {
  draft: CategoryDraft;
  disabled: boolean;
  onChange: (next: CategoryDraft) => void;
  onAdd: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: "0.7rem", paddingTop: "0.85rem", borderTop: "1px solid rgba(197, 205, 196, 0.7)" }}>
      <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "end" }}>
        <label>
          <span>코드</span>
          <input disabled={disabled} value={draft.code} onChange={(event) => onChange({ ...draft, code: event.target.value })} />
        </label>
        <label>
          <span>한글 명칭</span>
          <input disabled={disabled} value={draft.labelKo} onChange={(event) => onChange({ ...draft, labelKo: event.target.value })} />
        </label>
        <label>
          <span>영문 명칭</span>
          <input disabled={disabled} value={draft.labelEn} onChange={(event) => onChange({ ...draft, labelEn: event.target.value })} />
        </label>
        <label>
          <span>정렬 순서</span>
          <input disabled={disabled} value={draft.sortOrder} onChange={(event) => onChange({ ...draft, sortOrder: event.target.value })} />
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="primary-button" disabled={disabled} onClick={onAdd} type="button">
          추가
        </button>
      </div>
    </div>
  );
}

export function AdminFoundationShell() {
  const { currentProjectId, availableProjects, switchProject, refreshProjects, refreshWorkTypes } = useProjectMeta();
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectDraftName, setProjectDraftName] = useState("");
  const [selectedProjectName, setSelectedProjectName] = useState("");
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [members, setMembers] = useState<MembershipPayload[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<AdminProfileSummary[]>([]);
  const [newMember, setNewMember] = useState<MembershipPayload>({ profileId: "", displayName: "", email: "", role: "member" });
  const [globalByField, setGlobalByField] = useState<CategoryDefinitionsMap>(emptyCategoryDefinitions);
  const [projectByField, setProjectByField] = useState<CategoryDefinitionsMap>(emptyCategoryDefinitions);
  const [newGlobalDrafts, setNewGlobalDrafts] = useState<CategoryDraftMap>(emptyCategoryDrafts);
  const [newProjectDrafts, setNewProjectDrafts] = useState<CategoryDraftMap>(emptyCategoryDrafts);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);

  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;

  async function reloadGlobalCategories() {
    const entries = await Promise.all(taskCategoryFieldKeys.map(async (fieldKey) => [fieldKey, await readJson<TaskCategoryDefinition[]>(`/api/admin/categories?fieldKey=${fieldKey}`, { cache: "no-store" })] as const));
    setGlobalByField(Object.fromEntries(entries) as CategoryDefinitionsMap);
  }

  async function reloadProjectCategories(projectId: string) {
    const entries = await Promise.all(taskCategoryFieldKeys.map(async (fieldKey) => [fieldKey, await readJson<TaskCategoryDefinition[]>(`/api/admin/projects/${projectId}/categories?fieldKey=${fieldKey}`, { cache: "no-store" })] as const));
    setProjectByField(Object.fromEntries(entries) as CategoryDefinitionsMap);
  }

  async function loadProjectScopedData(projectId: string) {
    const [memberData] = await Promise.all([
      readJson<{ members: MembershipPayload[]; availableProfiles: AdminProfileSummary[] }>(`/api/admin/projects/${projectId}/members`, { cache: "no-store" }),
      reloadProjectCategories(projectId),
    ]);
    setMembers(memberData.members);
    setAvailableProfiles(memberData.availableProfiles);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      setProjectsLoading(true);
      try {
        await refreshProjects();
        await reloadGlobalCategories();
        if (active) setStatusMessage(null);
      } catch (error) {
        if (active) setStatusMessage(error instanceof Error ? error.message : "Failed to load admin data.");
      } finally {
        if (active) setProjectsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshProjects]);

  useEffect(() => {
    setSelectedProjectName(selectedProject?.name ?? "");
    if (!currentProjectId) {
      setMembers([]);
      setAvailableProfiles([]);
      setProjectByField(emptyCategoryDefinitions());
      return;
    }
    void loadProjectScopedData(currentProjectId)
      .then(() => setStatusMessage(null))
      .catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 데이터를 불러오지 못했습니다."));
  }, [currentProjectId, selectedProject?.name]);

  async function saveCategoryDefinition(definitionId: string, next: { labelKo: string; labelEn: string; sortOrder: number; isActive: boolean }) {
    await readJson(`/api/admin/categories/${definitionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    await reloadGlobalCategories();
    if (currentProjectId) await reloadProjectCategories(currentProjectId);
    await refreshWorkTypes();
    setStatusMessage("카테고리 정의를 저장했습니다.");
  }

  return (
    <section className="workspace">
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">관리자</p>
          <h2>기본 설정</h2>
          <p className="workspace__copy">프로젝트, 참여자, 그리고 작업유형·협업범위·관련분야 카테고리 정의를 관리합니다.</p>
        </div>
        {statusMessage ? <p className="workspace__meta">{statusMessage}</p> : null}
      </header>

      <div className="composer-card">
        <div className="composer-card__body" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)" }}>
          <div style={{ display: "grid", gap: "0.65rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
              <strong>빠른 전환</strong>
              <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{availableProjects.length}개 프로젝트</span>
            </div>
            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {availableProjects.map((project) => {
                const isCurrent = project.id === currentProjectId;
                const isSwitching = project.id === switchingProjectId;
                return (
                  <button key={project.id} className={isCurrent ? "primary-button" : "secondary-button"} disabled={isCurrent || Boolean(switchingProjectId)} onClick={() => { setSwitchingProjectId(project.id); void switchProject(project.id).then(() => setStatusMessage("현재 프로젝트를 전환했습니다.")).catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 전환에 실패했습니다.")).finally(() => setSwitchingProjectId(null)); }} style={{ justifyContent: "space-between", minHeight: "3rem", opacity: isSwitching ? 0.7 : 1 }} type="button">
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
                    <span style={{ fontSize: "0.82rem", opacity: 0.75 }}>{isCurrent ? "현재" : isSwitching ? "전환 중" : "열기"}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label>
            <span>현재 프로젝트</span>
            <select disabled={projectsLoading || availableProjects.length === 0 || Boolean(switchingProjectId)} value={currentProjectId ?? ""} onChange={(event) => { setSwitchingProjectId(event.target.value); void switchProject(event.target.value).then(() => setStatusMessage("현재 프로젝트를 전환했습니다.")).catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 전환에 실패했습니다.")).finally(() => setSwitchingProjectId(null)); }}>
              {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__body" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label><span>선택된 프로젝트</span><input disabled value={selectedProject?.name ?? ""} /></label>
          <label><span>새 프로젝트 이름</span><input value={selectedProjectName} onChange={(event) => setSelectedProjectName(event.target.value)} /></label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button className="secondary-button" disabled={!currentProjectId || renamingProject} onClick={() => { if (!currentProjectId) return; setRenamingProject(true); void readJson("/api/project", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: currentProjectId, name: selectedProjectName }) }).then(async () => { await refreshProjects(); setStatusMessage("프로젝트 이름을 수정했습니다."); }).catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 이름 수정에 실패했습니다.")).finally(() => setRenamingProject(false)); }} type="button">{renamingProject ? "저장 중..." : "이름 변경"}</button>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__body" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <label><span>새 프로젝트 만들기</span><input value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} /></label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="primary-button" disabled={creatingProject} onClick={() => { setCreatingProject(true); void readJson<{ id: string }>("/api/admin/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: projectDraftName }) }).then(async (project) => { setProjectDraftName(""); await refreshProjects(); await switchProject(project.id); setStatusMessage("프로젝트를 만들었습니다."); }).catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 생성에 실패했습니다.")).finally(() => setCreatingProject(false)); }} type="button">{creatingProject ? "생성 중..." : "프로젝트 생성"}</button>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header"><div><h3>프로젝트 참여자</h3><p style={{ margin: 0, color: "var(--muted)" }}>선택된 프로젝트의 참여자 목록을 관리합니다.</p></div></div>
        <div className="composer-card__body">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {members.map((member) => (
              <div key={`${member.profileId}-${member.email}`} style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1.2fr 1fr 1fr auto", alignItems: "end" }}>
                <label><span>이름</span><input value={member.displayName} onChange={(event) => setMembers((previous) => previous.map((entry) => entry.profileId === member.profileId ? { ...entry, displayName: event.target.value } : entry))} /></label>
                <label><span>이메일</span><input value={member.email} onChange={(event) => setMembers((previous) => previous.map((entry) => entry.profileId === member.profileId ? { ...entry, email: event.target.value } : entry))} /></label>
                <label><span>권한</span><select value={member.role} onChange={(event) => setMembers((previous) => previous.map((entry) => entry.profileId === member.profileId ? { ...entry, role: event.target.value === "manager" ? "manager" : "member" } : entry))}><option value="member">멤버</option><option value="manager">관리자</option></select></label>
                <button className="secondary-button" onClick={() => setMembers((previous) => previous.filter((entry) => entry.profileId !== member.profileId))} type="button">제거</button>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", alignItems: "end" }}>
            <label><span>기존 사용자</span><select value={newMember.profileId} onChange={(event) => { const profile = availableProfiles.find((entry) => entry.id === event.target.value); if (profile) setNewMember({ profileId: profile.id, displayName: profile.displayName, email: profile.email, role: "member" }); }}><option value="">선택하거나 직접 입력</option>{availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} ({profile.email})</option>)}</select></label>
            <label><span>프로필 ID</span><input value={newMember.profileId} onChange={(event) => setNewMember((previous) => ({ ...previous, profileId: event.target.value }))} /></label>
            <label><span>이름</span><input value={newMember.displayName} onChange={(event) => setNewMember((previous) => ({ ...previous, displayName: event.target.value }))} /></label>
            <label><span>이메일</span><input value={newMember.email} onChange={(event) => setNewMember((previous) => ({ ...previous, email: event.target.value }))} /></label>
            <button className="secondary-button" onClick={() => { if (!newMember.profileId || !newMember.displayName) { setStatusMessage("프로필 ID와 이름은 필수입니다."); return; } setMembers((previous) => [...previous.filter((entry) => entry.profileId !== newMember.profileId), newMember]); setNewMember({ profileId: "", displayName: "", email: "", role: "member" }); }} type="button">추가</button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="primary-button" disabled={!currentProjectId || savingMembers} onClick={() => { if (!currentProjectId) return; setSavingMembers(true); void readJson(`/api/admin/projects/${currentProjectId}/members`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberships: members }) }).then(async () => { await loadProjectScopedData(currentProjectId); setStatusMessage("프로젝트 참여자 정보를 저장했습니다."); }).catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 참여자 저장에 실패했습니다.")).finally(() => setSavingMembers(false)); }} type="button">{savingMembers ? "저장 중..." : "참여자 저장"}</button>
          </div>
        </div>
      </div>

      {taskCategoryFieldKeys.map((fieldKey) => (
        <div className="composer-card" key={fieldKey}>
          <div className="composer-card__header"><div><h3>{labelForField(fieldKey)}</h3><p style={{ margin: 0, color: "var(--muted)" }}>{fieldDescription[fieldKey]}</p></div></div>
          <div className="composer-card__body" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", alignItems: "start" }}>
            <section style={{ display: "grid", gap: "0.6rem", padding: "0.9rem 1rem", border: "1px solid rgba(197, 205, 196, 0.7)", borderRadius: "14px", background: "rgba(255, 255, 255, 0.72)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}><strong>공통 정의</strong><span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>전체 프로젝트 공통</span></div>
              {globalByField[fieldKey].length === 0 ? <p style={{ margin: 0, color: "var(--muted)" }}>등록된 공통 정의가 없습니다.</p> : null}
              {globalByField[fieldKey].map((definition) => <CategoryRow key={definition.id} definition={definition} onSave={(next) => saveCategoryDefinition(definition.id, next)} />)}
              <DraftRow draft={newGlobalDrafts[fieldKey]} disabled={false} onChange={(next) => setNewGlobalDrafts((previous) => ({ ...previous, [fieldKey]: next }))} onAdd={() => { void readJson("/api/admin/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldKey, ...newGlobalDrafts[fieldKey], sortOrder: Number(newGlobalDrafts[fieldKey].sortOrder || 0) }) }).then(async () => { setNewGlobalDrafts((previous) => ({ ...previous, [fieldKey]: emptyCategoryDraft() })); await reloadGlobalCategories(); await refreshWorkTypes(); setStatusMessage(`${labelForField(fieldKey)} 공통 정의를 추가했습니다.`); }).catch((error) => setStatusMessage(error instanceof Error ? error.message : "공통 카테고리 추가에 실패했습니다.")); }} />
            </section>
            <section style={{ display: "grid", gap: "0.6rem", padding: "0.9rem 1rem", border: "1px solid rgba(197, 205, 196, 0.7)", borderRadius: "14px", background: "rgba(255, 255, 255, 0.72)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}><strong>프로젝트 오버라이드</strong><span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{selectedProject?.name ?? "선택된 프로젝트 없음"}</span></div>
              {projectByField[fieldKey].length === 0 ? <p style={{ margin: 0, color: "var(--muted)" }}>등록된 프로젝트 정의가 없습니다.</p> : null}
              {projectByField[fieldKey].map((definition) => <CategoryRow key={definition.id} definition={definition} onSave={(next) => saveCategoryDefinition(definition.id, next)} />)}
              <DraftRow draft={newProjectDrafts[fieldKey]} disabled={!currentProjectId} onChange={(next) => setNewProjectDrafts((previous) => ({ ...previous, [fieldKey]: next }))} onAdd={() => { if (!currentProjectId) return; void readJson(`/api/admin/projects/${currentProjectId}/categories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldKey, ...newProjectDrafts[fieldKey], sortOrder: Number(newProjectDrafts[fieldKey].sortOrder || 0) }) }).then(async () => { setNewProjectDrafts((previous) => ({ ...previous, [fieldKey]: emptyCategoryDraft() })); await reloadProjectCategories(currentProjectId); await refreshWorkTypes(); setStatusMessage(`${labelForField(fieldKey)} 프로젝트 정의를 추가했습니다.`); }).catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 카테고리 추가에 실패했습니다.")); }} />
            </section>
          </div>
        </div>
      ))}
    </section>
  );
}
