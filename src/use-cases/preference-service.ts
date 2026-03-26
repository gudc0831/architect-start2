import type { QuickCreateWidthMap, TaskListLayoutPreference } from "@/domains/preferences/types";
import { sanitizeQuickCreateWidths, sanitizeTaskListLayoutPreference } from "@/domains/preferences/types";
import { preferenceRepository } from "@/repositories";

export async function getQuickCreateWidths(profileId: string) {
  return preferenceRepository.getQuickCreateWidths(profileId);
}

export async function updateQuickCreateWidths(profileId: string, widths: unknown): Promise<QuickCreateWidthMap> {
  return preferenceRepository.saveQuickCreateWidths(profileId, sanitizeQuickCreateWidths(widths));
}

export async function getTaskListLayout(profileId: string) {
  return preferenceRepository.getTaskListLayout(profileId);
}

export async function updateTaskListLayout(profileId: string, layout: unknown): Promise<TaskListLayoutPreference> {
  return preferenceRepository.saveTaskListLayout(profileId, sanitizeTaskListLayoutPreference(layout));
}
