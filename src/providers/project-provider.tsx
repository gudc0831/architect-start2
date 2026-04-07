"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { buildSystemWorkTypeDefinitions, type WorkTypeDefinition } from "@/domains/task/work-types";
import { previewProjectName } from "@/lib/preview/demo-data";

type ProjectOption = {
  id: string;
  name: string;
  source: string;
};

type ProjectSelectionPayload = {
  currentProjectId: string | null;
  availableProjects: Array<{ id: string; name: string; source?: string }>;
  source?: string | null;
  workTypeDefinitions: WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, TaskCategoryDefinition[]>>;
};

type ProjectContextValue = {
  currentProjectId: string | null;
  availableProjects: ProjectOption[];
  workTypeDefinitions: WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, TaskCategoryDefinition[]>>;
  workTypesLoaded: boolean;
  selectionVersion: number;
  switchProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshWorkTypes: () => Promise<void>;
  projectName: string;
  setProjectName: (value: string) => void;
  projectLoaded: boolean;
  projectSource: string | null;
  isSyncing: boolean;
};

const projectNameStorageKey = "architect-start.project-name";
const projectIdStorageKey = "architect-start.project-id";
const defaultProjectName = "Architect Start";
const previewProjectId = "preview-project";

const ProjectContext = createContext<ProjectContextValue>({
  currentProjectId: null,
  availableProjects: [],
  workTypeDefinitions: [],
  categoryDefinitionsByField: {},
  workTypesLoaded: false,
  selectionVersion: 0,
  switchProject: async () => {},
  refreshProjects: async () => {},
  refreshWorkTypes: async () => {},
  projectName: defaultProjectName,
  setProjectName: () => {},
  projectLoaded: false,
  projectSource: null,
  isSyncing: false,
});

function toProjectOption(project: { id: string; name: string; source?: string }, fallbackSource: string | null): ProjectOption {
  return {
    id: project.id,
    name: project.name || defaultProjectName,
    source: project.source || fallbackSource || "local-file",
  };
}

async function readApiData<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };

  if (!response.ok || !json.data) {
    throw new Error(json.error?.message || `Request failed (${response.status})`);
  }

  return json.data;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [availableProjects, setAvailableProjects] = useState<ProjectOption[]>([]);
  const [workTypeDefinitions, setWorkTypeDefinitions] = useState<WorkTypeDefinition[]>([]);
  const [categoryDefinitionsByField, setCategoryDefinitionsByField] = useState<
    Partial<Record<TaskCategoryFieldKey, TaskCategoryDefinition[]>>
  >({});
  const [workTypesLoaded, setWorkTypesLoaded] = useState(false);
  const [projectName, setProjectNameState] = useState(defaultProjectName);
  const [previewName, setPreviewName] = useState(previewProjectName);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [projectSource, setProjectSource] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const lastCommittedRef = useRef<{ projectId: string | null; projectName: string }>({
    projectId: null,
    projectName: defaultProjectName,
  });

  function persistLocalSelection(projectId: string | null, name: string) {
    if (typeof window === "undefined") {
      return;
    }

    if (projectId) {
      window.localStorage.setItem(projectIdStorageKey, projectId);
    } else {
      window.localStorage.removeItem(projectIdStorageKey);
    }

    window.localStorage.setItem(projectNameStorageKey, name);
  }

  const applyProjectSelection = useCallback((
    payload: ProjectSelectionPayload,
    options?: { loaded?: boolean; workTypesLoaded?: boolean },
  ) => {
    const projects = payload.availableProjects.map((project) => toProjectOption(project, payload.source ?? null));
    const selectedProject =
      projects.find((project) => project.id === payload.currentProjectId) ??
      projects[0] ??
      {
        id: null,
        name: defaultProjectName,
        source: payload.source || "local-file",
      };

    setAvailableProjects(projects);
    setCurrentProjectId(selectedProject.id);
    setProjectNameState(selectedProject.name);
    setProjectSource(selectedProject.source);
    if (
      lastCommittedRef.current.projectId !== selectedProject.id ||
      lastCommittedRef.current.projectName !== selectedProject.name
    ) {
      setSelectionVersion((previous) => previous + 1);
    }
    lastCommittedRef.current = {
      projectId: selectedProject.id,
      projectName: selectedProject.name,
    };
    persistLocalSelection(selectedProject.id, selectedProject.name);

    if (Array.isArray(payload.workTypeDefinitions)) {
      setWorkTypeDefinitions(payload.workTypeDefinitions);
    }

    if (payload.categoryDefinitionsByField) {
      setCategoryDefinitionsByField(payload.categoryDefinitionsByField);
    }

    if (options?.loaded ?? true) {
      setProjectLoaded(true);
    }

    if (options?.workTypesLoaded ?? true) {
      setWorkTypesLoaded(true);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    const data = await readApiData<ProjectSelectionPayload>("/api/projects", { cache: "no-store" });
    applyProjectSelection(data);
  }, [applyProjectSelection]);

  const refreshWorkTypes = useCallback(async () => {
    const data = await readApiData<ProjectSelectionPayload>("/api/projects", { cache: "no-store" });
    applyProjectSelection(data, { loaded: false });
  }, [applyProjectSelection]);

  useEffect(() => {
    if (isPreview) {
      setProjectLoaded(true);
      return;
    }

    let isMounted = true;

    void readApiData<ProjectSelectionPayload>("/api/projects", { cache: "no-store" })
      .then((data) => {
        if (!isMounted) {
          return;
        }

        applyProjectSelection(data);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setAvailableProjects([]);
        setCurrentProjectId(null);
        setProjectNameState(defaultProjectName);
        setProjectSource(null);
        setProjectLoaded(true);
        setWorkTypeDefinitions([]);
        setCategoryDefinitionsByField({});
        setWorkTypesLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [applyProjectSelection, isPreview]);

  useEffect(() => {
    if (!isPreview) {
      return;
    }

    const definitions = buildSystemWorkTypeDefinitions();
    setWorkTypeDefinitions(definitions);
    setCategoryDefinitionsByField({
      workType: definitions,
      coordinationScope: [],
      requestedBy: [],
      relatedDisciplines: [],
      locationRef: [],
    });
    setWorkTypesLoaded(true);
  }, [isPreview]);

  const switchProject = useCallback(async (projectId: string) => {
    if (isPreview || !projectId || projectId === currentProjectId) {
      return;
    }

    setIsSyncing(true);

    try {
      const data = await readApiData<ProjectSelectionPayload>("/api/projects/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      applyProjectSelection(data);
    } finally {
      setIsSyncing(false);
    }
  }, [applyProjectSelection, currentProjectId, isPreview]);

  const setProjectName = useCallback((value: string) => {
    if (isPreview) {
      setPreviewName(value);
      return;
    }
  }, [isPreview]);

  const value = isPreview
    ? {
        currentProjectId: previewProjectId,
        availableProjects: [{ id: previewProjectId, name: previewName, source: "preview" }],
        workTypeDefinitions,
        categoryDefinitionsByField,
        workTypesLoaded: true,
        selectionVersion: 0,
        switchProject: async () => {},
        refreshProjects: async () => {},
        refreshWorkTypes: async () => {},
        projectName: previewName,
        setProjectName,
        projectLoaded: true,
        projectSource: "preview",
        isSyncing: false,
      }
    : {
        currentProjectId,
        availableProjects,
        workTypeDefinitions,
        categoryDefinitionsByField,
        workTypesLoaded,
        selectionVersion,
        switchProject,
        refreshProjects,
        refreshWorkTypes,
        projectName,
        setProjectName,
        projectLoaded,
        projectSource,
        isSyncing,
      };

  // Remount consumers when the selected project changes so task/file fetch effects re-run against the new project scope.
  const providerKey = isPreview ? `preview:${previewProjectId}` : `project:${currentProjectId ?? "none"}:${selectionVersion}`;

  return <ProjectContext.Provider key={providerKey} value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectMeta() {
  return useContext(ProjectContext);
}
