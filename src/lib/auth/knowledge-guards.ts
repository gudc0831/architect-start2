import type { AuthUser } from "@/domains/auth/types";
import { forbidden } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/require-user";

export type KnowledgeAdminCapability =
  | "knowledge.candidates.review"
  | "knowledge.approved_wiki.export"
  | "knowledge.legal_sources.review"
  | "knowledge.sync.preflight"
  | "knowledge.operations.debug"
  | "knowledge.discovery.scan"
  | "knowledge.discovery.promote"
  | "knowledge.discovery.dismiss"
  | "knowledge.import.preview"
  | "knowledge.import.confirm"
  | "knowledge.rubric.manage"
  | "knowledge.rubric.activate"
  | "knowledge.generation.manage"
  | "knowledge.generation.activate";

export type KnowledgeAdminAccess = {
  allowed: boolean;
  role: AuthUser["role"];
  mapping: "global_admin_backfill" | "explicit_capability" | "none";
  capabilities: KnowledgeAdminCapability[];
  migration: {
    schemaVersion: 1;
    profileCapabilityTableReady: false;
    backfillRequired: boolean;
    backfillSource: "global_admin";
  };
};

const allKnowledgeAdminCapabilities: KnowledgeAdminCapability[] = [
  "knowledge.candidates.review",
  "knowledge.approved_wiki.export",
  "knowledge.legal_sources.review",
  "knowledge.sync.preflight",
  "knowledge.operations.debug",
  "knowledge.discovery.scan",
  "knowledge.discovery.promote",
  "knowledge.discovery.dismiss",
  "knowledge.import.preview",
  "knowledge.import.confirm",
  "knowledge.rubric.manage",
  "knowledge.rubric.activate",
  "knowledge.generation.manage",
  "knowledge.generation.activate",
];

export function canManageKnowledge(user: Pick<AuthUser, "role" | "accessStatus">) {
  return resolveKnowledgeAdminAccess(user).allowed;
}

export function resolveKnowledgeAdminAccess(user: Pick<AuthUser, "role" | "accessStatus">): KnowledgeAdminAccess {
  const active = user.accessStatus === "active";
  const mappedFromGlobalAdmin = active && user.role === "admin";
  return {
    allowed: mappedFromGlobalAdmin,
    role: user.role,
    mapping: mappedFromGlobalAdmin ? "global_admin_backfill" : "none",
    capabilities: mappedFromGlobalAdmin ? allKnowledgeAdminCapabilities : [],
    migration: {
      schemaVersion: 1,
      profileCapabilityTableReady: false,
      backfillRequired: mappedFromGlobalAdmin,
      backfillSource: "global_admin",
    },
  };
}

export function assertKnowledgeCapability(user: Pick<AuthUser, "role" | "accessStatus">, capability: KnowledgeAdminCapability) {
  const access = resolveKnowledgeAdminAccess(user);
  if (!access.allowed || !access.capabilities.includes(capability)) {
    throw forbidden("Knowledge admin capability is required", "KNOWLEDGE_ADMIN_CAPABILITY_REQUIRED");
  }
  return access;
}

export async function requireKnowledgeAdmin() {
  const user = await requireUser();

  if (!resolveKnowledgeAdminAccess(user).allowed) {
    throw forbidden("Knowledge admin access is required", "KNOWLEDGE_ADMIN_REQUIRED");
  }

  return user;
}
