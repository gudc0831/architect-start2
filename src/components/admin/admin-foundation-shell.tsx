"use client";

import { useEffect, useState } from "react";
import type { AdminProfileSummary, ProjectMembershipRecord } from "@/domains/admin/types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import { useProjectMeta } from "@/providers/project-provider";

type MembershipPayload = Pick<ProjectMembershipRecord, "profileId" | "displayName" | "email" | "role">;

type ProjectOption = {
  id: string;
  name: string;
  source: string;
};

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
          <span>Korean label</span>
          <input value={labelKo} onChange={(event) => setLabelKo(event.target.value)} />
        </label>
        <label>
          <span>English label</span>
          <input value={labelEn} onChange={(event) => setLabelEn(event.target.value)} />
        </label>
        <label>
          <span>Sort order</span>
          <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: "0.5rem", alignContent: "end" }}>
          <span>Active</span>
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
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function ProjectQuickSwitch({
  projects,
  currentProjectId,
  switchingProjectId,
  onSwitch,
}: {
  projects: ProjectOption[];
  currentProjectId: string | null;
  switchingProjectId: string | null;
  onSwitch: (projectId: string) => void;
}) {
  if (projects.length <= 1) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: "0.65rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <strong>Quick switch</strong>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{projects.length} projects</span>
      </div>
      <div
        style={{
          display: "grid",
          gap: "0.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {projects.map((project) => {
          const isCurrent = project.id === currentProjectId;
          const isSwitching = project.id === switchingProjectId;

          return (
            <button
              key={project.id}
              className={isCurrent ? "primary-button" : "secondary-button"}
              disabled={isCurrent || Boolean(switchingProjectId)}
              onClick={() => onSwitch(project.id)}
              style={{ justifyContent: "space-between", minHeight: "3rem", opacity: isSwitching ? 0.7 : 1 }}
              type="button"
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</span>
              <span style={{ fontSize: "0.82rem", opacity: 0.75 }}>{isCurrent ? "Current" : isSwitching ? "Switching" : "Open"}</span>
            </button>
          );
        })}
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

        setStatusMessage(error instanceof Error ? error.message : "Failed to load admin data.");
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
      setStatusMessage(error instanceof Error ? error.message : "Failed to load project data.");
    });
  }, [availableProjects, currentProjectId]);

  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;

  async function handleProjectSwitch(projectId: string) {
    if (!projectId || projectId === currentProjectId) {
      return;
    }

    setSwitchingProjectId(projectId);
    try {
      await switchProject(projectId);
      setStatusMessage("Switched current project.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to switch project.");
    } finally {
      setSwitchingProjectId(null);
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
      setStatusMessage("Project name updated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to update project name.");
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
      await handleProjectSwitch(project.id);
      setStatusMessage("Project created.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setCreatingProject(false);
    }
  }

  return (
    <section className="workspace">
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">ADMIN</p>
          <h2>Admin Foundation</h2>
          <p className="workspace__copy">
            Manage project switching, members, base work types, and project-only work types from one place.
          </p>
        </div>
        {statusMessage ? <p className="workspace__meta">{statusMessage}</p> : null}
      </header>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>Project Navigation</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Switch the current project here. Editing and creation are split into dedicated sections below.
            </p>
          </div>
        </div>
        <div className="composer-card__body" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)" }}>
          <ProjectQuickSwitch
            currentProjectId={currentProjectId}
            onSwitch={(projectId) => {
              void handleProjectSwitch(projectId);
            }}
            projects={availableProjects}
            switchingProjectId={switchingProjectId}
          />
          <label>
            <span>Current project</span>
            <select
              disabled={projectsLoading || availableProjects.length === 0 || Boolean(switchingProjectId)}
              onChange={(event) => {
                void handleProjectSwitch(event.target.value);
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
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "space-between",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ color: "var(--muted)" }}>
            {selectedProject ? `Selected: ${selectedProject.name}` : "No project selected"}
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            {switchingProjectId
              ? `Switching to ${availableProjects.find((project) => project.id === switchingProjectId)?.name ?? "project"}...`
              : "Admin can see all projects."}
          </span>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>Edit Selected Project</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>Rename only the project currently selected above.</p>
          </div>
        </div>
        <div className="composer-card__body" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label>
            <span>Selected project</span>
            <input disabled value={selectedProject?.name ?? ""} />
          </label>
          <label>
            <span>New display name</span>
            <input value={selectedProjectName} onChange={(event) => setSelectedProjectName(event.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            className="secondary-button"
            disabled={!currentProjectId || renamingProject}
            onClick={() => {
              void handleRenameProject();
            }}
            type="button"
          >
            {renamingProject ? "Saving..." : "Rename Project"}
          </button>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>Create Project</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Create a new project without mixing creation controls into the project editing form.
            </p>
          </div>
        </div>
        <div className="composer-card__body" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <label>
            <span>New project name</span>
            <input value={projectDraftName} onChange={(event) => setProjectDraftName(event.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            className="primary-button"
            disabled={creatingProject}
            onClick={() => {
              void handleCreateProject();
            }}
            type="button"
          >
            {creatingProject ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>Project Members</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>Replace the selected project&apos;s member assignment list.</p>
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
                  <span>Name</span>
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
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", alignItems: "end" }}>
            <label>
              <span>Existing user</span>
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
                <option value="">Choose or enter manually</option>
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
              <span>Name</span>
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
                  setStatusMessage("profileId and display name are required.");
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
              Add Member
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
                    setStatusMessage("Project members updated.");
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "Failed to update project members."))
                  .finally(() => setSavingMembers(false));
              }}
              type="button"
            >
              {savingMembers ? "Saving..." : "Save Members"}
            </button>
          </div>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>Global Work Types</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>Manage base work types visible across every project.</p>
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
                setStatusMessage("Global work type updated.");
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
              <span>Korean label</span>
              <input
                value={newGlobalWorkType.labelKo}
                onChange={(event) => setNewGlobalWorkType((previous) => ({ ...previous, labelKo: event.target.value }))}
              />
            </label>
            <label>
              <span>English label</span>
              <input
                value={newGlobalWorkType.labelEn}
                onChange={(event) => setNewGlobalWorkType((previous) => ({ ...previous, labelEn: event.target.value }))}
              />
            </label>
            <label>
              <span>Sort order</span>
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
                    setStatusMessage("Global work type added.");
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "Failed to add global work type."));
              }}
              type="button"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="composer-card">
        <div className="composer-card__header">
          <div>
            <h3>Project Work Types</h3>
            <p style={{ margin: 0, color: "var(--muted)" }}>Manage work types visible only inside the selected project.</p>
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
                setStatusMessage("Project work type updated.");
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
              <span>Korean label</span>
              <input
                value={newProjectWorkType.labelKo}
                onChange={(event) => setNewProjectWorkType((previous) => ({ ...previous, labelKo: event.target.value }))}
              />
            </label>
            <label>
              <span>English label</span>
              <input
                value={newProjectWorkType.labelEn}
                onChange={(event) => setNewProjectWorkType((previous) => ({ ...previous, labelEn: event.target.value }))}
              />
            </label>
            <label>
              <span>Sort order</span>
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
                    setStatusMessage("Project work type added.");
                  })
                  .catch((error) => setStatusMessage(error instanceof Error ? error.message : "Failed to add project work type."));
              }}
              type="button"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
