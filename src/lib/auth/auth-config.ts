import type { AuthUser } from "@/domains/auth/types";
import { backendMode, getBackendModeConfigErrorMessage, getMissingCloudBackendEnv, hasCloudBackendConfig } from "@/lib/backend-mode";

const authFallbackUser: AuthUser = {
  id: "local-auth-placeholder",
  email: "local@architect.start",
  displayName: "Local Admin",
  name: "Local Admin",
  role: "admin",
};

export function getMissingAuthRuntimeEnv() {
  return backendMode === "cloud" ? getMissingCloudBackendEnv() : [];
}

export function hasAuthRuntimeConfig() {
  return backendMode === "cloud" && hasCloudBackendConfig();
}

export function isAuthStubMode() {
  return backendMode !== "cloud";
}

export function getAuthRuntimeConfigErrorMessage() {
  return backendMode === "cloud" ? getBackendModeConfigErrorMessage("cloud") : null;
}

export function getAuthFallbackUser() {
  return authFallbackUser;
}

