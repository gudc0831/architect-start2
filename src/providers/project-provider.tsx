"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buildSystemWorkTypeDefinitions, type WorkTypeDefinition } from "@/domains/task/work-types";
import { previewProjectName } from "@/lib/preview/demo-data";

type ProjectOption = {
  id: string;
  name: string;
  source: string;
};

type ProjectContextValue = {
  currentProjectId: string | null;
  availableProjects: ProjectOption[];
  workTypeDefinitions: WorkTypeDefinition[];
  workTypesLoaded: boolean;
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
  workTypesLoaded: false,
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

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [availableProjects, setAvailableProjects] = useState<ProjectOption[]>([]);
  const [workTypeDefinitions, setWorkTypeDefinitions] = useState<WorkTypeDefinition[]>([]);
  const [workTypesLoaded, setWorkTypesLoaded] = useState(false);
  const [projectName, setProjectNameState] = useState(defaultProjectName);
  const [previewName, setPreviewName] = useState(previewProjectName);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [projectSource, setProjectSource] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
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
    payload: {
      currentProjectId: string | null;
      availableProjects: Array<{ id: string; name: string; source?: string }>;
      source?: string | null;
    },
    options?: { loaded?: boolean },
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
    lastCommittedRef.current = {
      projectId: selectedProject.id,
      projectName: selectedProject.name,
    };
    persistLocalSelection(selectedProject.id, selectedProject.name);

    if (options?.loaded ?? true) {
      setProjectLoaded(true);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const json = (await response.json()) as {
      data: {
        currentProjectId: string | null;
        availableProjects: Array<{ id: string; name: string; source?: string }>;
        source?: string | null;
      };
    };

    applyProjectSelection(json.data);
  }, [applyProjectSelection]);

  const refreshWorkTypes = useCallback(async () => {
    const response = await fetch("/api/work-types", { cache: "no-store" });
    const json = (await response.json()) as {
      data: {
        currentProjectId: string | null;
        definitions: WorkTypeDefinition[];
      };
    };

    setWorkTypeDefinitions(Array.isArray(json.data?.definitions) ? json.data.definitions : []);
    setWorkTypesLoaded(true);
  }, []);

  useEffect(() => {
    if (isPreview) {
      setProjectLoaded(true);
      return;
    }

    let isMounted = true;

    void fetch("/api/projects", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: {
        data: {
          currentProjectId: string | null;
          availableProjects: Array<{ id: string; name: string; source?: string }>;
          source?: string | null;
        };
      }) => {
        if (!isMounted) {
          return;
        }

        applyProjectSelection(json.data);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setProjectSource(null);
        setProjectLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [applyProjectSelection, isPreview]);

  useEffect(() => {
    if (isPreview) {
      setWorkTypeDefinitions(buildSystemWorkTypeDefinitions());
      setWorkTypesLoaded(true);
      return;
    }

    let isMounted = true;
    setWorkTypesLoaded(false);

    void fetch("/api/work-types", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { data: { definitions: WorkTypeDefinition[] } }) => {
        if (!isMounted) {
          return;
        }

        setWorkTypeDefinitions(Array.isArray(json.data?.definitions) ? json.data.definitions : []);
        setWorkTypesLoaded(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setWorkTypeDefinitions([]);
        setWorkTypesLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId, isPreview]);

  useEffect(() => {
    if (
      isPreview ||
      !projectLoaded ||
      !currentProjectId ||
      currentProjectId !== lastCommittedRef.current.projectId ||
      projectName === lastCommittedRef.current.projectName
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsSyncing(true);
      void fetch("/api/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, name: projectName }),
      })
        .then((response) => response.json())
        .then((json: {
          data: {
            id: string;
            name: string;
            source: string;
            currentProjectId: string;
          };
        }) => {
          const nextProject = {
            id: json.data.id,
            name: json.data.name || projectName,
            source: json.data.source,
          };

          setAvailableProjects((previous) =>
            previous.map((project) => (project.id === nextProject.id ? { ...project, ...nextProject } : project)),
          );
          setCurrentProjectId(json.data.currentProjectId || nextProject.id);
          setProjectNameState(nextProject.name);
          setProjectSource(nextProject.source);
          lastCommittedRef.current = {
            projectId: json.data.currentProjectId || nextProject.id,
            projectName: nextProject.name,
          };
          persistLocalSelection(json.data.currentProjectId || nextProject.id, nextProject.name);
        })
        .finally(() => setIsSyncing(false));
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentProjectId, isPreview, projectLoaded, projectName]);

  const switchProject = useCallback(async (projectId: string) => {
    if (isPreview || !projectId || projectId === currentProjectId) {
      return;
    }

    setIsSyncing(true);

    try {
      const response = await fetch("/api/projects/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = (await response.json()) as {
        data: {
          currentProjectId: string | null;
          availableProjects: Array<{ id: string; name: string; source?: string }>;
          source?: string | null;
        };
      };

      applyProjectSelection(json.data, { loaded: true });
    } finally {
      setIsSyncing(false);
    }
  }, [applyProjectSelection, currentProjectId, isPreview]);

  const setProjectName = useCallback((value: string) => {
    if (isPreview) {
      setPreviewName(value);
      return;
    }

    setProjectNameState(value);
    persistLocalSelection(currentProjectId, value);
  }, [currentProjectId, isPreview]);

  const value = isPreview
    ? {
        currentProjectId: previewProjectId,
        availableProjects: [{ id: previewProjectId, name: previewName, source: "preview" }],
        workTypeDefinitions,
        workTypesLoaded: true,
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
        workTypesLoaded,
        switchProject,
        refreshProjects,
        refreshWorkTypes,
        projectName,
        setProjectName,
        projectLoaded,
        projectSource,
        isSyncing,
      };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectMeta() {
  return useContext(ProjectContext);
}
