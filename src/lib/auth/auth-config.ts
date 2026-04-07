import type { AuthUser } from "@/domains/auth/types";
import { serviceUnavailable } from "@/lib/api/errors";
import { backendMode, getBackendModeConfigErrorMessage, getMissingCloudBackendEnv, hasCloudBackendConfig } from "@/lib/backend-mode";

const authFallbackUser: AuthUser = {
  id: "local-auth-placeholder",
  email: "local@architect.start",
  displayName: "Local Admin",
  name: "Local Admin",
  role: "admin",
};

const nonCloudProductionOverrideEnvKey = "ALLOW_INSECURE_NON_CLOUD_PRODUCTION";

function isExplicitNonCloudProductionOverrideEnabled() {
  return process.env[nonCloudProductionOverrideEnvKey]?.trim().toLowerCase() === "true";
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isUnsafeNonCloudProductionMode() {
  return isProductionRuntime() && backendMode !== "cloud" && !isExplicitNonCloudProductionOverrideEnabled();
}

function getUnsafeNonCloudProductionMessage() {
  return `Non-cloud backend mode is disabled in production. Set ${nonCloudProductionOverrideEnvKey}=true only for an explicit override.`;
}

export function getMissingAuthRuntimeEnv() {
  if (isUnsafeNonCloudProductionMode()) {
    return [nonCloudProductionOverrideEnvKey];
  }

  return backendMode === "cloud" ? getMissingCloudBackendEnv() : [];
}

export function hasAuthRuntimeConfig() {
  if (isUnsafeNonCloudProductionMode()) {
    return false;
  }

  return backendMode === "cloud" && hasCloudBackendConfig();
}

export function isAuthStubMode() {
  return backendMode !== "cloud" && !isUnsafeNonCloudProductionMode();
}

export function getAuthRuntimeConfigErrorMessage() {
  if (isUnsafeNonCloudProductionMode()) {
    return getUnsafeNonCloudProductionMessage();
  }

  return backendMode === "cloud" ? getBackendModeConfigErrorMessage("cloud") : null;
}

export function getAuthFallbackUser() {
  return authFallbackUser;
}

export function assertSafeAuthRuntime() {
  if (!isUnsafeNonCloudProductionMode()) {
    return;
  }

  throw serviceUnavailable(getUnsafeNonCloudProductionMessage(), "AUTH_RUNTIME_MODE_UNSAFE");
}
