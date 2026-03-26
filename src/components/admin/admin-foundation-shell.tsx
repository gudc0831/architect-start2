"use client";

import { useEffect, useState } from "react";
import type { AdminProfileSummary, ProjectMembershipRecord } from "@/domains/admin/types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import { useProjectMeta } from "@/providers/project-provider";

type MembershipPayload = Pick<ProjectMembershipRecord, "profileId" | "displayName" | "email" | "role">;

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const json = (await response.json()) as { data?: T; error?: { message?: string } };

  if (!response.ok || !json.data) {
    throw new Error(json.error?.message || "Request failed");
  }

  return json.data;
}

function WorkTypeEditor({
  definition,
  title,
  onSave,
}: {
  definition: WorkTypeDefinition;
  title: string;
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
    <div className="composer-card" style={{ marginBottom: "0.75rem" }}>
      <div className="composer-card__header">
        <div>
          <h3>{title}</h3>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            code: <code>{definition.code}</code> {definition.projectId ? "(project)" : definition.isSystem ? "(base)" : "(global)"}
          </p>
        </div>
      </div>
      <div className="composer-card__body" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        <label>
          <span>한글</span>
          <input value={labelKo} onChange={(event) => setLabelKo(event.target.value)} />
        </label>
        <label>
          <span>English</span>
          <input value={labelEn} onChange={(event) => setLabelEn(event.target.value)} />
        </label>
        <label>
          <span>정렬 순서</span>
          <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: "0.5rem", alignContent: "end" }}>
          <span>활성</span>
          <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="primary-button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave({
              labelKo,
              labelEn,
              sortOrder: Number(sortOrder || 0),
              isActive,
            }).finally(() => setSaving(false));
          }}
          type="button"
        >
          저장
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
  const [members, setMembers] = useState<MembershipPayload[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<AdminProfileSummary[]>([]);
  const [newMember, setNewMember] = useState<MembershipPayload>({
    profileId: "",
    displayName: "",
    email: "",
    role: "member",
  });
  const [globalWorkTypes, setGlobalWorkTypes] = useState<WorkTypeDefinition[]>([]);
  const [projectWorkTypes, setProjectWorkTypes] = useState<WorkTypeDefinition[]>([]);
  const [newGlobalWorkType, setNewGlobalWorkType] = useState({
    code: "",
    labelKo: "",
    labelEn: "",
    sortOrder: "0",
  });
  const [newProjectWorkType, setNewProjectWorkType] = useState({
    code: "",
    labelKo: "",
    labelEn: "",
    sortOrder: "0",
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);

  async function reloadGlobalWorkTypes() {
    setGlobalWorkTypes(await readJson<WorkTypeDefinition[]>("/api/admin/work-types", { cache: "no-store" }));
  }

  async function reloadProjectWorkTypes(projectId: string) {
    setProjectWorkTypes(await readJson<WorkTypeDefinition[]>(`/api/admin/projects/${projectId}/work-types`, { cache: "no-store" }));
  }

  async function loadProjectScopedData(projectId: string) {
    const [memberData, projectDefinitions] = await Promise.all([
      readJson<{ projectId: string; members: MembershipPayload[]; availableProfiles: AdminProfileSummary[] }>(
        `/api/admin/projects/${projectId}/members`,
        { cache: "no-store" },
      ),
      readJson<WorkTypeDefinition[]>(`/api/admin/projects/${projectId}/work-types`, { cache: "no-store" }),
    ]);

    setMembers(memberData.members);
    setAvailableProfiles(memberData.availableProfiles);
    setProjectWorkTypes(projectDefinitions);
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setProjectsLoading(true);

      try {
        await refreshProjects();
        const definitions = await readJson<WorkTypeDefinition[]>("/api/admin/work-types", { cache: "no-store" });
        if (!isMounted) {
          return;
        }

        setGlobalWorkTypes(definitions);
        setStatusMessage(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setStatusMessage(error instanceof Error ? error.message : "관리자 데이터를 불러오지 못했습니다.");
      } finally {
        if (isMounted) {
          setProjectsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [refreshProjects]);

  useEffect(() => {
    const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;
    setSelectedProjectName(selectedProject?.name ?? "");

    if (!currentProjectId) {
      setMembers([]);
      setAvailableProfiles([]);
      setProjectWorkTypes([]);
      return;
    }

    void loadProjectScopedData(currentProjectId).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "프로젝트 데이터를 불러오지 못했습니다.");
    });
  }, [availableProjects, currentProjectId]);

  return (
    <section className="workspace">
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">ADMIN</p>
          <h2>관리자 시트 Foundation</h2>
          <p className="workspace__copy">
            현재 프로젝트 선택과 프로젝트별 사용자 배정, 전역 기본 작업유형과 프로젝트별 추가 작업유형을 분리해서 관리합니다.
          </p>
        </div>
        {statusMessage ? <p className="workspace__meta">{statusMessage}</p> : null}
      </header>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>프로젝트</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>현재 프로젝트를 선택하고, 새 프로젝트를 만들거나 이름을 변경합니다.</p>
          </div>
        </div>
        <div className="composer-card__body" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <label>
            <span>현재 프로젝트</span>
            <select
              disabled={projectsLoading || availableProjects.length === 0}
              onChange={(event) => {
                void switchProject(event.target.value).then(() => setStatusMessage("현재 프로젝트를 변경했습니다."));
              }}
              value={currentProjectId ?? ""}
            >
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>선택한 프로젝트 이름</span>
            <input value={selectedProjectName} onChange={(event) => setSelectedProjectName(event.target.value)} />
          </label>
          <label>
            <span>새 프로젝트 이름</span>
            <input value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            className="secondary-button"
            disabled={!currentProjectId}
            onClick={() => {
              if (!currentProjectId) {
                return;
              }

              void readJson("/api/project", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: currentProjectId, name: selectedProjectName }),
              })
                .then(async () => {
                  await refreshProjects();
                  setStatusMessage("프로젝트 이름을 수정했습니다.");
                })
                .catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 이름 수정에 실패했습니다."));
            }}
            type="button"
          >
            이름 수정
          </button>
          <button
            className="primary-button"
            onClick={() => {
              void readJson<{ id: string }>("/api/admin/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: projectDraftName }),
              })
                .then(async (project) => {
                  setProjectDraftName("");
                  await refreshProjects();
                  await switchProject(project.id);
                  setStatusMessage("새 프로젝트를 생성했습니다.");
                })
                .catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 생성에 실패했습니다."));
            }}
            type="button"
          >
            프로젝트 생성
          </button>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>프로젝트 멤버십</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>선택한 프로젝트의 사용자 배정을 전체 교체 방식으로 저장합니다.</p>
          </div>
        </div>
        <div className="composer-card__body">
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {members.map((member) => (
              <div
                key={`${member.profileId}-${member.email}`}
                style={{
                  display: "grid",
                  gap: "0.75rem",
                  gridTemplateColumns: "1.2fr 1fr 1fr auto",
                  alignItems: "end",
                }}
              >
                <label>
                  <span>이름</span>
                  <input
                    value={member.displayName}
                    onChange={(event) =>
                      setMembers((previous) =>
                        previous.map((entry) =>
                          entry.profileId === member.profileId ? { ...entry, displayName: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    value={member.email}
                    onChange={(event) =>
                      setMembers((previous) =>
                        previous.map((entry) => (entry.profileId === member.profileId ? { ...entry, email: event.target.value } : entry)),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Role</span>
                  <select
                    value={member.role}
                    onChange={(event) =>
                      setMembers((previous) =>
                        previous.map((entry) =>
                          entry.profileId === member.profileId
                            ? { ...entry, role: event.target.value === "manager" ? "manager" : "member" }
                            : entry,
                        ),
                      )
                    }
                  >
                    <option value="member">member</option>
                    <option value="manager">manager</option>
                  </select>
                </label>
                <button
                  className="secondary-button"
                  onClick={() => setMembers((previous) => previous.filter((entry) => entry.profileId !== member.profileId))}
                  type="button"
                >
                  제거
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", alignItems: "end" }}>
            <label>
              <span>기존 사용자</span>
              <select
                onChange={(event) => {
                  const profile = availableProfiles.find((entry) => entry.id === event.target.value);
                  if (!profile) {
                    return;
                  }

                  setNewMember({
                    profileId: profile.id,
                    displayName: profile.displayName,
                    email: profile.email,
                    role: "member",
                  });
                }}
                value={newMember.profileId}
              >
                <option value="">직접 입력 또는 선택</option>
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName} ({profile.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Profile ID</span>
              <input value={newMember.profileId} onChange={(event) => setNewMember((previous) => ({ ...previous, profileId: event.target.value }))} />
            </label>
            <label>
              <span>이름</span>
              <input value={newMember.displayName} onChange={(event) => setNewMember((previous) => ({ ...previous, displayName: event.target.value }))} />
            </label>
            <label>
              <span>Email</span>
              <input value={newMember.email} onChange={(event) => setNewMember((previous) => ({ ...previous, email: event.target.value }))} />
            </label>
            <button
              className="secondary-button"
              onClick={() => {
                if (!newMember.profileId || !newMember.displayName) {
                  setStatusMessage("멤버를 추가하려면 profileId와 이름이 필요합니다.");
                  return;
                }

                setMembers((previous) => {
                  const withoutDuplicate = previous.filter((entry) => entry.profileId !== newMember.profileId);
                  return [...withoutDuplicate, newMember];
                });
                setNewMember({ profileId: "", displayName: "", email: "", role: "member" });
              }}
              type="button"
            >
              멤버 추가
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="primary-button"
              disabled={!currentProjectId || savingMembers}
              onClick={() => {
                if (!currentProjectId) {
                  return;
                }

                setSavingMembers(true);
                void readJson(`/api/admin/projects/${currentProjectId}/members`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ memberships: members }),
                })
                  .then(async () => {
                    await loadProjectScopedData(currentProjectId);
                    setStatusMessage("프로젝트 멤버십을 저장했습니다.");
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 멤버십 저장에 실패했습니다."))
                  .finally(() => setSavingMembers(false));
              }}
              type="button"
            >
              멤버십 저장
            </button>
          </div>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>전역 Work Types</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>모든 프로젝트에서 공통으로 보이는 기본 작업유형을 관리합니다.</p>
          </div>
        </div>
        <div className="composer-card__body">
          {globalWorkTypes.map((definition) => (
            <WorkTypeEditor
              definition={definition}
              key={definition.id}
              onSave={async (next) => {
                await readJson(`/api/admin/work-types/${definition.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(next),
                });
                await reloadGlobalWorkTypes();
                await refreshWorkTypes();
                setStatusMessage("전역 work type을 저장했습니다.");
              }}
              title={definition.labelKo}
            />
          ))}

          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr 1fr 140px auto", alignItems: "end" }}>
            <label>
              <span>Code</span>
              <input value={newGlobalWorkType.code} onChange={(event) => setNewGlobalWorkType((previous) => ({ ...previous, code: event.target.value }))} />
            </label>
            <label>
              <span>한글</span>
              <input
                value={newGlobalWorkType.labelKo}
                onChange={(event) => setNewGlobalWorkType((previous) => ({ ...previous, labelKo: event.target.value }))}
              />
            </label>
            <label>
              <span>English</span>
              <input
                value={newGlobalWorkType.labelEn}
                onChange={(event) => setNewGlobalWorkType((previous) => ({ ...previous, labelEn: event.target.value }))}
              />
            </label>
            <label>
              <span>정렬 순서</span>
              <input
                value={newGlobalWorkType.sortOrder}
                onChange={(event) => setNewGlobalWorkType((previous) => ({ ...previous, sortOrder: event.target.value }))}
              />
            </label>
            <button
              className="primary-button"
              onClick={() => {
                void readJson("/api/admin/work-types", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...newGlobalWorkType,
                    sortOrder: Number(newGlobalWorkType.sortOrder || 0),
                  }),
                })
                  .then(async () => {
                    setNewGlobalWorkType({ code: "", labelKo: "", labelEn: "", sortOrder: "0" });
                    await reloadGlobalWorkTypes();
                    await refreshWorkTypes();
                    setStatusMessage("전역 work type을 추가했습니다.");
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "전역 work type 추가에 실패했습니다."));
              }}
              type="button"
            >
              추가
            </button>
          </div>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>프로젝트 추가 Work Types</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>선택한 프로젝트에서만 보이는 추가 작업유형을 관리합니다.</p>
          </div>
        </div>
        <div className="composer-card__body">
          {projectWorkTypes.map((definition) => (
            <WorkTypeEditor
              definition={definition}
              key={definition.id}
              onSave={async (next) => {
                await readJson(`/api/admin/work-types/${definition.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(next),
                });
                if (currentProjectId) {
                  await reloadProjectWorkTypes(currentProjectId);
                }
                await refreshWorkTypes();
                setStatusMessage("프로젝트 work type을 저장했습니다.");
              }}
              title={definition.labelKo}
            />
          ))}

          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr 1fr 140px auto", alignItems: "end" }}>
            <label>
              <span>Code</span>
              <input
                value={newProjectWorkType.code}
                onChange={(event) => setNewProjectWorkType((previous) => ({ ...previous, code: event.target.value }))}
              />
            </label>
            <label>
              <span>한글</span>
              <input
                value={newProjectWorkType.labelKo}
                onChange={(event) => setNewProjectWorkType((previous) => ({ ...previous, labelKo: event.target.value }))}
              />
            </label>
            <label>
              <span>English</span>
              <input
                value={newProjectWorkType.labelEn}
                onChange={(event) => setNewProjectWorkType((previous) => ({ ...previous, labelEn: event.target.value }))}
              />
            </label>
            <label>
              <span>정렬 순서</span>
              <input
                value={newProjectWorkType.sortOrder}
                onChange={(event) => setNewProjectWorkType((previous) => ({ ...previous, sortOrder: event.target.value }))}
              />
            </label>
            <button
              className="primary-button"
              disabled={!currentProjectId}
              onClick={() => {
                if (!currentProjectId) {
                  return;
                }

                void readJson(`/api/admin/projects/${currentProjectId}/work-types`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...newProjectWorkType,
                    sortOrder: Number(newProjectWorkType.sortOrder || 0),
                  }),
                })
                  .then(async () => {
                    setNewProjectWorkType({ code: "", labelKo: "", labelEn: "", sortOrder: "0" });
                    await reloadProjectWorkTypes(currentProjectId);
                    await refreshWorkTypes();
                    setStatusMessage("프로젝트 work type을 추가했습니다.");
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "프로젝트 work type 추가에 실패했습니다."));
              }}
              type="button"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
