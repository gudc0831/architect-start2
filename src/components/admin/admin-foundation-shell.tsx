"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { AdminProfileSummary, ProjectMembershipRecord } from "@/domains/admin/types";
import { isAssignableProjectRole } from "@/lib/auth/project-capabilities";
import {
  taskCategoryFieldKeys,
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { labelForField } from "@/lib/ui-copy";
import { useProjectMeta } from "@/providers/project-provider";
import styles from "./admin-foundation-shell.module.css";

type MembershipPayload = Pick<ProjectMembershipRecord, "profileId" | "displayName" | "email" | "role">;
type CategoryDraft = { code: string; labelKo: string; labelEn: string; sortOrder: string };
type CategoryDefinitionsMap = Record<TaskCategoryFieldKey, TaskCategoryDefinition[]>;
type CategoryDraftMap = Record<TaskCategoryFieldKey, CategoryDraft>;
type FoundationSettingsPayload = { ownerDiscipline: string };
type SaveCategoryDefinitionInput = { labelKo: string; labelEn: string; sortOrder: number; isActive: boolean };

const emptyCategoryDraft = (): CategoryDraft => ({ code: "", labelKo: "", labelEn: "", sortOrder: "0" });
const emptyCategoryDefinitions = (): CategoryDefinitionsMap =>
  Object.fromEntries(taskCategoryFieldKeys.map((fieldKey) => [fieldKey, [] as TaskCategoryDefinition[]])) as CategoryDefinitionsMap;
const emptyCategoryDrafts = (): CategoryDraftMap =>
  Object.fromEntries(taskCategoryFieldKeys.map((fieldKey) => [fieldKey, emptyCategoryDraft()])) as CategoryDraftMap;

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

function getDefinitionScopeLabel(definition: TaskCategoryDefinition) {
  if (definition.projectId) {
    return "프로젝트";
  }

  if (definition.isSystem) {
    return "기본값";
  }

  return "공통";
}

function SectionCard({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <p className={styles.sectionDescription}>{description}</p>
        </div>
        {aside ? <div className={styles.sectionAside}>{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CategoryRow({
  definition,
  isFirst,
  onSave,
}: {
  definition: TaskCategoryDefinition;
  isFirst: boolean;
  onSave: (next: SaveCategoryDefinitionInput) => Promise<void>;
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
    <article className={clsx(styles.definitionRow, isFirst && styles.definitionRowFirst)}>
      <div className={styles.definitionMeta}>
        <div className={styles.definitionMetaText}>
          <strong className={styles.definitionTitle}>{definition.labelKo || definition.code}</strong>
          <div className={styles.definitionMetaLine}>
            <code className={styles.codeChip}>{definition.code}</code>
            <span className={styles.metaBadge}>{getDefinitionScopeLabel(definition)}</span>
          </div>
        </div>
        <span className={clsx(styles.stateBadge, isActive ? styles.stateBadgeActive : styles.stateBadgeInactive)}>
          {isActive ? "사용 중" : "비활성"}
        </span>
      </div>

      <div className={styles.definitionEditor}>
        <div className={styles.definitionFields}>
          <label className={styles.field}>
            <span>한글 명칭</span>
            <input onChange={(event) => setLabelKo(event.target.value)} value={labelKo} />
          </label>
          <label className={styles.field}>
            <span>영문 명칭</span>
            <input onChange={(event) => setLabelEn(event.target.value)} value={labelEn} />
          </label>
          <label className={styles.field}>
            <span>정렬 순서</span>
            <input inputMode="numeric" onChange={(event) => setSortOrder(event.target.value)} value={sortOrder} />
          </label>
        </div>

        <div className={styles.definitionActions}>
          <label className={styles.checkboxField}>
            <span>사용 여부</span>
            <input
              checked={isActive}
              className={styles.checkboxInput}
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
          </label>
          <button
            className={clsx(styles.button, styles.buttonSecondary, styles.rowActionButton)}
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
    </article>
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
    <div className={styles.addBlock}>
      <div className={styles.addBlockHeader}>
        <div>
          <h4 className={styles.addBlockTitle}>새 정의 추가</h4>
          <p className={styles.addBlockCopy}>코드와 표시 이름을 입력한 뒤 바로 추가할 수 있습니다.</p>
        </div>
      </div>

      <div className={styles.addFields}>
        <label className={styles.field}>
          <span>코드</span>
          <input disabled={disabled} onChange={(event) => onChange({ ...draft, code: event.target.value })} value={draft.code} />
        </label>
        <label className={styles.field}>
          <span>한글 명칭</span>
          <input disabled={disabled} onChange={(event) => onChange({ ...draft, labelKo: event.target.value })} value={draft.labelKo} />
        </label>
        <label className={styles.field}>
          <span>영문 명칭</span>
          <input disabled={disabled} onChange={(event) => onChange({ ...draft, labelEn: event.target.value })} value={draft.labelEn} />
        </label>
        <label className={styles.field}>
          <span>정렬 순서</span>
          <input
            disabled={disabled}
            inputMode="numeric"
            onChange={(event) => onChange({ ...draft, sortOrder: event.target.value })}
            value={draft.sortOrder}
          />
        </label>
      </div>

      <div className={styles.addAction}>
        <button className={clsx(styles.button, styles.buttonPrimary)} disabled={disabled} onClick={onAdd} type="button">
          추가
        </button>
      </div>
    </div>
  );
}

function CategoryPane({
  title,
  caption,
  emptyMessage,
  definitions,
  draft,
  draftDisabled,
  onDraftChange,
  onAdd,
  onSaveDefinition,
}: {
  title: string;
  caption: string;
  emptyMessage: string;
  definitions: TaskCategoryDefinition[];
  draft: CategoryDraft;
  draftDisabled: boolean;
  onDraftChange: (next: CategoryDraft) => void;
  onAdd: () => void;
  onSaveDefinition: (definitionId: string, next: SaveCategoryDefinitionInput) => Promise<void>;
}) {
  return (
    <section className={styles.categoryPane}>
      <div className={styles.paneHeader}>
        <div className={styles.paneHeading}>
          <h3 className={styles.paneTitle}>{title}</h3>
          <p className={styles.paneCaption}>{caption}</p>
        </div>
      </div>

      <div className={styles.paneBody}>
        {definitions.length === 0 ? <p className={styles.emptyCopy}>{emptyMessage}</p> : null}
        {definitions.map((definition, index) => (
          <CategoryRow
            definition={definition}
            isFirst={index === 0}
            key={definition.id}
            onSave={(next) => onSaveDefinition(definition.id, next)}
          />
        ))}
      </div>

      <DraftRow disabled={draftDisabled} draft={draft} onAdd={onAdd} onChange={onDraftChange} />
    </section>
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
  const [newMember, setNewMember] = useState<MembershipPayload>({ profileId: "", displayName: "", email: "", role: "editor" });
  const [globalByField, setGlobalByField] = useState<CategoryDefinitionsMap>(emptyCategoryDefinitions);
  const [projectByField, setProjectByField] = useState<CategoryDefinitionsMap>(emptyCategoryDefinitions);
  const [newGlobalDrafts, setNewGlobalDrafts] = useState<CategoryDraftMap>(emptyCategoryDrafts);
  const [newProjectDrafts, setNewProjectDrafts] = useState<CategoryDraftMap>(emptyCategoryDrafts);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);
  const [ownerDiscipline, setOwnerDiscipline] = useState("건축");
  const [savingOwnerDiscipline, setSavingOwnerDiscipline] = useState(false);

  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;
  const selectedProjectLabel = selectedProject?.name ?? "선택된 프로젝트 없음";
  const isProjectSwitchBusy = projectsLoading || Boolean(switchingProjectId);

  const reloadGlobalCategories = useCallback(async () => {
    const entries = await Promise.all(
      taskCategoryFieldKeys.map(
        async (fieldKey) =>
          [fieldKey, await readJson<TaskCategoryDefinition[]>(`/api/admin/categories?fieldKey=${fieldKey}`, { cache: "no-store" })] as const,
      ),
    );
    setGlobalByField(Object.fromEntries(entries) as CategoryDefinitionsMap);
  }, []);

  const reloadFoundationSettings = useCallback(async () => {
    const settings = await readJson<FoundationSettingsPayload>("/api/admin/foundation-settings", { cache: "no-store" });
    setOwnerDiscipline(settings.ownerDiscipline);
  }, []);

  const reloadProjectCategories = useCallback(async (projectId: string) => {
    const entries = await Promise.all(
      taskCategoryFieldKeys.map(
        async (fieldKey) =>
          [
            fieldKey,
            await readJson<TaskCategoryDefinition[]>(`/api/admin/projects/${projectId}/categories?fieldKey=${fieldKey}`, {
              cache: "no-store",
            }),
          ] as const,
      ),
    );
    setProjectByField(Object.fromEntries(entries) as CategoryDefinitionsMap);
  }, []);

  const loadProjectScopedData = useCallback(async (projectId: string) => {
    const [memberData] = await Promise.all([
      readJson<{ members: MembershipPayload[]; availableProfiles: AdminProfileSummary[] }>(`/api/admin/projects/${projectId}/members`, {
        cache: "no-store",
      }),
      reloadProjectCategories(projectId),
    ]);
    setMembers(memberData.members);
    setAvailableProfiles(memberData.availableProfiles);
  }, [reloadProjectCategories]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setProjectsLoading(true);
      try {
        await refreshProjects();
        await Promise.all([reloadGlobalCategories(), reloadFoundationSettings()]);
        if (active) {
          setStatusMessage(null);
        }
      } catch (error) {
        if (active) {
          setStatusMessage(error instanceof Error ? error.message : "Failed to load admin data.");
        }
      } finally {
        if (active) {
          setProjectsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshProjects, reloadFoundationSettings, reloadGlobalCategories]);

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
  }, [currentProjectId, loadProjectScopedData, selectedProject?.name]);

  async function saveCategoryDefinition(definitionId: string, next: SaveCategoryDefinitionInput) {
    await readJson(`/api/admin/categories/${definitionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    await reloadGlobalCategories();
    if (currentProjectId) {
      await reloadProjectCategories(currentProjectId);
    }
    await refreshWorkTypes();
    setStatusMessage("카테고리 정의를 저장했습니다.");
  }

  async function handleProjectSwitch(projectId: string) {
    if (!projectId) {
      return;
    }

    setSwitchingProjectId(projectId);

    try {
      await switchProject(projectId);
      setStatusMessage("현재 프로젝트를 전환했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "프로젝트 전환에 실패했습니다.");
    } finally {
      setSwitchingProjectId(null);
    }
  }

  async function handleSaveOwnerDiscipline() {
    setSavingOwnerDiscipline(true);

    try {
      const settings = await readJson<FoundationSettingsPayload>("/api/admin/foundation-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerDiscipline }),
      });
      setOwnerDiscipline(settings.ownerDiscipline);
      setStatusMessage("책임 분야를 저장했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "책임 분야 저장에 실패했습니다.");
    } finally {
      setSavingOwnerDiscipline(false);
    }
  }

  async function handleRenameProject() {
    if (!currentProjectId) {
      return;
    }

    setRenamingProject(true);

    try {
      await readJson("/api/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, name: selectedProjectName }),
      });
      await refreshProjects();
      setStatusMessage("프로젝트 이름을 수정했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "프로젝트 이름 수정에 실패했습니다.");
    } finally {
      setRenamingProject(false);
    }
  }

  async function handleCreateProject() {
    setCreatingProject(true);

    try {
      const project = await readJson<{ id: string }>("/api/admin/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectDraftName }),
      });
      setProjectDraftName("");
      await refreshProjects();
      await switchProject(project.id);
      setStatusMessage("프로젝트를 만들었습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleSaveMembers() {
    if (!currentProjectId) {
      return;
    }

    setSavingMembers(true);

    try {
      await readJson(`/api/admin/projects/${currentProjectId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberships: members }),
      });
      await loadProjectScopedData(currentProjectId);
      setStatusMessage("프로젝트 참여자 정보를 저장했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "프로젝트 참여자 저장에 실패했습니다.");
    } finally {
      setSavingMembers(false);
    }
  }

  function handleAddMember() {
    if (!newMember.profileId || !newMember.displayName) {
      setStatusMessage("프로필 ID와 이름은 필수입니다.");
      return;
    }

    setMembers((previous) => [...previous.filter((entry) => entry.profileId !== newMember.profileId), newMember]);
    setNewMember({ profileId: "", displayName: "", email: "", role: "editor" });
  }

  return (
    <section className={styles.adminPage}>
      <header className={styles.heroCard}>
        <div className={styles.heroHeading}>
          <p className={styles.eyebrow}>관리자</p>
          <h1 className={styles.pageTitle}>기본 설정</h1>
          <p className={styles.pageDescription}>
            프로젝트, 참여자, 작업유형, 협업범위, 관련분야, 요청자, 위치참조 카테고리 정의를 한 화면에서 관리합니다.
          </p>
        </div>
        {statusMessage ? (
          <p aria-live="polite" className={styles.statusBanner} role="status">
            {statusMessage}
          </p>
        ) : null}
      </header>

      <SectionCard
        description="모든 작업 상세 화면에서는 숨김 처리되고, 조회 값과 엑셀 내보내기에 동일하게 적용됩니다."
        title={labelForField("ownerDiscipline")}
      >
        <div className={styles.inlineForm}>
          <label className={styles.field}>
            <span>{labelForField("ownerDiscipline")}</span>
            <input onChange={(event) => setOwnerDiscipline(event.target.value)} value={ownerDiscipline} />
          </label>
          <button
            className={clsx(styles.button, styles.buttonPrimary, styles.inlineAction)}
            disabled={savingOwnerDiscipline}
            onClick={() => {
              void handleSaveOwnerDiscipline();
            }}
            type="button"
          >
            {savingOwnerDiscipline ? "저장 중..." : "책임 분야 저장"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        aside={<span className={styles.supportMeta}>{availableProjects.length}개 프로젝트</span>}
        description="빠른 전환과 현재 프로젝트 선택, 이름 변경, 신규 생성을 한 번에 정리합니다."
        title="프로젝트 관리"
      >
        <div className={styles.projectLayout}>
          <div className={styles.columnStack}>
            <div className={styles.subcard}>
              <div className={styles.subcardHeader}>
                <div>
                  <h3 className={styles.subcardTitle}>빠른 전환</h3>
                  <p className={styles.subcardCopy}>자주 쓰는 프로젝트를 버튼으로 바로 전환합니다.</p>
                </div>
              </div>

              <div className={styles.projectSwitchGrid}>
                {availableProjects.map((project) => {
                  const isCurrent = project.id === currentProjectId;
                  const isSwitching = project.id === switchingProjectId;

                  return (
                    <button
                      className={clsx(
                        styles.projectSwitchButton,
                        isCurrent ? styles.projectSwitchButtonActive : styles.projectSwitchButtonInactive,
                      )}
                      disabled={isCurrent || isProjectSwitchBusy}
                      key={project.id}
                      onClick={() => {
                        void handleProjectSwitch(project.id);
                      }}
                      type="button"
                    >
                      <span className={styles.projectSwitchName}>{project.name}</span>
                      <span className={styles.projectSwitchMeta}>{isCurrent ? "현재" : isSwitching ? "전환 중" : "열기"}</span>
                    </button>
                  );
                })}
              </div>

              <label className={styles.field}>
                <span>현재 프로젝트</span>
                <select
                  disabled={availableProjects.length === 0 || isProjectSwitchBusy}
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }
                    void handleProjectSwitch(event.target.value);
                  }}
                  value={currentProjectId ?? ""}
                >
                  {availableProjects.length === 0 ? <option value="">프로젝트 없음</option> : null}
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={styles.columnStack}>
            <div className={styles.subcard}>
              <div className={styles.subcardHeader}>
                <div>
                  <h3 className={styles.subcardTitle}>프로젝트 이름 변경</h3>
                  <p className={styles.subcardCopy}>선택된 프로젝트를 확인하고 새 이름으로 즉시 수정합니다.</p>
                </div>
              </div>

              <div className={styles.formGridTwo}>
                <label className={styles.field}>
                  <span>선택된 프로젝트</span>
                  <input disabled value={selectedProject?.name ?? ""} />
                </label>
                <label className={styles.field}>
                  <span>새 프로젝트 이름</span>
                  <input onChange={(event) => setSelectedProjectName(event.target.value)} value={selectedProjectName} />
                </label>
              </div>

              <div className={styles.actionRowEnd}>
                <button
                  className={clsx(styles.button, styles.buttonSecondary)}
                  disabled={!currentProjectId || renamingProject}
                  onClick={() => {
                    void handleRenameProject();
                  }}
                  type="button"
                >
                  {renamingProject ? "저장 중..." : "이름 변경"}
                </button>
              </div>
            </div>

            <div className={styles.subcard}>
              <div className={styles.subcardHeader}>
                <div>
                  <h3 className={styles.subcardTitle}>새 프로젝트 만들기</h3>
                  <p className={styles.subcardCopy}>새 프로젝트를 생성하고 바로 현재 작업 대상으로 전환합니다.</p>
                </div>
              </div>

              <label className={styles.field}>
                <span>새 프로젝트 이름</span>
                <input onChange={(event) => setProjectDraftName(event.target.value)} value={projectDraftName} />
              </label>

              <div className={styles.actionRowEnd}>
                <button
                  className={clsx(styles.button, styles.buttonPrimary)}
                  disabled={creatingProject}
                  onClick={() => {
                    void handleCreateProject();
                  }}
                  type="button"
                >
                  {creatingProject ? "생성 중..." : "프로젝트 생성"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        aside={<span className={styles.supportMeta}>{selectedProjectLabel}</span>}
        description="선택된 프로젝트의 참여자 목록을 편집하고 저장합니다."
        title="프로젝트 참여자"
      >
        <div className={styles.membersLayout}>
          <div className={styles.membersGroup}>
            <div className={styles.groupHeader}>
              <h3 className={styles.groupTitle}>현재 참여자</h3>
            </div>
            {members.length === 0 ? <p className={styles.emptyCopy}>등록된 참여자가 없습니다.</p> : null}
            {members.map((member, index) => (
              <div className={clsx(styles.memberRow, index === 0 && styles.memberRowFirst)} key={`${member.profileId}-${member.email}`}>
                <label className={styles.field}>
                  <span>이름</span>
                  <input
                    autoComplete="name"
                    onChange={(event) =>
                      setMembers((previous) =>
                        previous.map((entry) =>
                          entry.profileId === member.profileId ? { ...entry, displayName: event.target.value } : entry,
                        ),
                      )
                    }
                    value={member.displayName}
                  />
                </label>
                <label className={styles.field}>
                  <span>이메일</span>
                  <input
                    autoComplete="email"
                    onChange={(event) =>
                      setMembers((previous) =>
                        previous.map((entry) => (entry.profileId === member.profileId ? { ...entry, email: event.target.value } : entry)),
                      )
                    }
                    type="email"
                    value={member.email}
                  />
                </label>
                <label className={styles.field}>
                  <span>권한</span>
                  <select
                    onChange={(event) =>
                      setMembers((previous) =>
                        previous.map((entry) =>
                          entry.profileId === member.profileId
                            ? {
                                ...entry,
                                role: isAssignableProjectRole(event.target.value) ? event.target.value : "editor",
                              }
                            : entry,
                        ),
                      )
                    }
                    value={member.role}
                  >
                    <option value="viewer">뷰어</option>
                    <option value="editor">에디터</option>
                    <option value="manager">관리자</option>
                  </select>
                </label>
                <div className={styles.rowActionSlot}>
                  <button
                    className={clsx(styles.button, styles.buttonSecondary, styles.rowActionButton)}
                    onClick={() => setMembers((previous) => previous.filter((entry) => entry.profileId !== member.profileId))}
                    type="button"
                  >
                    제거
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.membersGroup}>
            <div className={styles.groupHeader}>
              <div>
                <h3 className={styles.groupTitle}>참여자 추가</h3>
                <p className={styles.groupCopy}>기존 사용자를 고르거나 프로필 ID를 직접 입력해 추가합니다.</p>
              </div>
            </div>

            <div className={styles.memberDraftRow}>
              <label className={styles.field}>
                <span>기존 사용자</span>
                <select
                  onChange={(event) => {
                    const profile = availableProfiles.find((entry) => entry.id === event.target.value);
                    if (profile) {
                      setNewMember({ profileId: profile.id, displayName: profile.displayName, email: profile.email, role: "editor" });
                    }
                  }}
                  value={newMember.profileId}
                >
                  <option value="">선택하거나 직접 입력</option>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName} ({profile.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>프로필 ID</span>
                <input onChange={(event) => setNewMember((previous) => ({ ...previous, profileId: event.target.value }))} value={newMember.profileId} />
              </label>
              <label className={styles.field}>
                <span>이름</span>
                <input
                  autoComplete="name"
                  onChange={(event) => setNewMember((previous) => ({ ...previous, displayName: event.target.value }))}
                  value={newMember.displayName}
                />
              </label>
              <label className={styles.field}>
                <span>이메일</span>
                <input
                  autoComplete="email"
                  onChange={(event) => setNewMember((previous) => ({ ...previous, email: event.target.value }))}
                  type="email"
                  value={newMember.email}
                />
              </label>
              <div className={styles.rowActionSlot}>
                <button className={clsx(styles.button, styles.buttonSecondary, styles.rowActionButton)} onClick={handleAddMember} type="button">
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.actionRowEnd}>
          <button
            className={clsx(styles.button, styles.buttonPrimary)}
            disabled={!currentProjectId || savingMembers}
            onClick={() => {
              void handleSaveMembers();
            }}
            type="button"
          >
            {savingMembers ? "저장 중..." : "참여자 저장"}
          </button>
        </div>
      </SectionCard>

      {taskCategoryFieldKeys.map((fieldKey) => (
        <SectionCard description={fieldDescription[fieldKey] ?? ""} key={fieldKey} title={labelForField(fieldKey)}>
          <div className={styles.categoryGrid}>
            <CategoryPane
              caption="전체 프로젝트 공통"
              definitions={globalByField[fieldKey]}
              draft={newGlobalDrafts[fieldKey]}
              draftDisabled={false}
              emptyMessage="등록된 공통 정의가 없습니다."
              onAdd={() => {
                void readJson("/api/admin/categories", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fieldKey, ...newGlobalDrafts[fieldKey], sortOrder: Number(newGlobalDrafts[fieldKey].sortOrder || 0) }),
                })
                  .then(async () => {
                    setNewGlobalDrafts((previous) => ({ ...previous, [fieldKey]: emptyCategoryDraft() }));
                    await reloadGlobalCategories();
                    await refreshWorkTypes();
                    setStatusMessage(`${labelForField(fieldKey)} 공통 정의를 추가했습니다.`);
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "공통 카테고리 추가에 실패했습니다."));
              }}
              onDraftChange={(next) => setNewGlobalDrafts((previous) => ({ ...previous, [fieldKey]: next }))}
              onSaveDefinition={saveCategoryDefinition}
              title="공통 정의"
            />

            <CategoryPane
              caption={selectedProjectLabel}
              definitions={projectByField[fieldKey]}
              draft={newProjectDrafts[fieldKey]}
              draftDisabled={!currentProjectId}
              emptyMessage="등록된 프로젝트 정의가 없습니다."
              onAdd={() => {
                if (!currentProjectId) {
                  return;
                }

                void readJson(`/api/admin/projects/${currentProjectId}/categories`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fieldKey, ...newProjectDrafts[fieldKey], sortOrder: Number(newProjectDrafts[fieldKey].sortOrder || 0) }),
                })
                  .then(async () => {
                    setNewProjectDrafts((previous) => ({ ...previous, [fieldKey]: emptyCategoryDraft() }));
                    await reloadProjectCategories(currentProjectId);
                    await refreshWorkTypes();
                    setStatusMessage(`${labelForField(fieldKey)} 프로젝트 정의를 추가했습니다.`);
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 카테고리 추가에 실패했습니다."));
              }}
              onDraftChange={(next) => setNewProjectDrafts((previous) => ({ ...previous, [fieldKey]: next }))}
              onSaveDefinition={saveCategoryDefinition}
              title="프로젝트 오버라이드"
            />
          </div>
        </SectionCard>
      ))}
    </section>
  );
}
