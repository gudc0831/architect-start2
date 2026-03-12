"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { previewProjectName } from "@/lib/preview/demo-data";

type ProjectContextValue = {
  projectName: string;
  setProjectName: (value: string) => void;
  projectLoaded: boolean;
  projectSource: string | null;
  isSyncing: boolean;
};

const storageKey = "architect-start.project-name";
const defaultProjectName = "새 프로젝트";

const ProjectContext = createContext<ProjectContextValue>({
  projectName: defaultProjectName,
  setProjectName: () => {},
  projectLoaded: false,
  projectSource: null,
  isSyncing: false,
});

function getInitialProjectName() {
  if (typeof window === "undefined") {
    return defaultProjectName;
  }

  return window.localStorage.getItem(storageKey) || defaultProjectName;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const [projectName, setProjectNameState] = useState(getInitialProjectName);
  const [previewName, setPreviewName] = useState(previewProjectName);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [projectSource, setProjectSource] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncedNameRef = useRef(getInitialProjectName());

  useEffect(() => {
    if (isPreview) {
      return;
    }

    let isMounted = true;

    void fetch("/api/project", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { data: { name: string; source: string } }) => {
        if (!isMounted) {
          return;
        }

        const nextName = json.data.name || defaultProjectName;
        setProjectNameState(nextName);
        setProjectSource(json.data.source);
        lastSyncedNameRef.current = nextName;
        window.localStorage.setItem(storageKey, nextName);
      })
      .catch(() => {
        if (isMounted) {
          setProjectSource(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setProjectLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isPreview]);

  useEffect(() => {
    if (isPreview || !projectLoaded || projectName === lastSyncedNameRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsSyncing(true);
      void fetch("/api/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      })
        .then((response) => response.json())
        .then((json: { data: { name: string; source: string } }) => {
          const nextName = json.data.name || projectName;
          lastSyncedNameRef.current = nextName;
          setProjectNameState(nextName);
          setProjectSource(json.data.source);
          window.localStorage.setItem(storageKey, nextName);
        })
        .finally(() => setIsSyncing(false));
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isPreview, projectLoaded, projectName]);

  function setProjectName(value: string) {
    if (isPreview) {
      setPreviewName(value);
      return;
    }

    setProjectNameState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, value);
    }
  }

  const value = isPreview
    ? {
        projectName: previewName,
        setProjectName,
        projectLoaded: true,
        projectSource: "preview",
        isSyncing: false,
      }
    : {
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
