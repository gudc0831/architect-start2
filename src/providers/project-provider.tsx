"use client";

import { createContext, useContext, useState } from "react";

type ProjectContextValue = {
  projectName: string;
  setProjectName: (value: string) => void;
};

const storageKey = "architect-start.project-name";
const defaultProjectName = "새 프로젝트";

const ProjectContext = createContext<ProjectContextValue>({
  projectName: defaultProjectName,
  setProjectName: () => {},
});

function getInitialProjectName() {
  if (typeof window === "undefined") {
    return defaultProjectName;
  }

  return window.localStorage.getItem(storageKey) || defaultProjectName;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectName, setProjectNameState] = useState(getInitialProjectName);

  function setProjectName(value: string) {
    setProjectNameState(value);
    window.localStorage.setItem(storageKey, value);
  }

  return (
    <ProjectContext.Provider value={{ projectName, setProjectName }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectMeta() {
  return useContext(ProjectContext);
}