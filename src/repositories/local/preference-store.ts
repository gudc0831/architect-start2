import type {
  QuickCreateWidthMap,
  TaskListColumnWidthMap,
  TaskListLayoutPreference,
  TaskListRowHeightMap,
  ThemeId,
  ThemePreference,
} from "@/domains/preferences/types";
import {
  DEFAULT_THEME_ID,
  sanitizeQuickCreateWidths,
  sanitizeTaskListColumnWidths,
  sanitizeTaskListLayoutPreference,
  sanitizeTaskListRowHeights,
  sanitizeThemeId,
} from "@/domains/preferences/types";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import type { PreferenceRepository } from "@/repositories/contracts";

type PreferenceStoreRecord = {
  quickCreateWidths?: QuickCreateWidthMap;
  taskListColumnWidths?: TaskListColumnWidthMap;
  taskListRowHeights?: TaskListRowHeightMap;
  taskListDetailPanelWidth?: number;
  themeId?: ThemeId;
  createdAt: string;
  updatedAt: string;
};

type PreferenceStore = Record<string, PreferenceStoreRecord>;

async function readStore(): Promise<PreferenceStore> {
  const parsed = await readLocalStore<PreferenceStore>("preferences", {});
  return parsed.value && typeof parsed.value === "object" ? parsed.value : {};
}

async function writeStore(store: PreferenceStore) {
  await writeLocalStore("preferences", store, { reason: "preferences.save" });
}

class LocalPreferenceRepository implements PreferenceRepository {
  async getQuickCreateWidths(profileId: string) {
    const store = await readStore();
    return sanitizeQuickCreateWidths(store[profileId]?.quickCreateWidths ?? {});
  }

  async saveQuickCreateWidths(profileId: string, widths: QuickCreateWidthMap) {
    const store = await readStore();
    const timestamp = new Date().toISOString();
    const current = store[profileId];
    store[profileId] = {
      quickCreateWidths: sanitizeQuickCreateWidths(widths),
      taskListColumnWidths: sanitizeTaskListColumnWidths(current?.taskListColumnWidths ?? {}),
      taskListRowHeights: sanitizeTaskListRowHeights(current?.taskListRowHeights ?? {}),
      taskListDetailPanelWidth: sanitizeTaskListLayoutPreference({
        detailPanelWidth: current?.taskListDetailPanelWidth,
      }).detailPanelWidth,
      themeId: sanitizeThemeId(current?.themeId ?? DEFAULT_THEME_ID),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await writeStore(store);
    return sanitizeQuickCreateWidths(store[profileId].quickCreateWidths ?? {});
  }

  async getTaskListLayout(profileId: string): Promise<TaskListLayoutPreference> {
    const store = await readStore();
    return sanitizeTaskListLayoutPreference({
      columnWidths: store[profileId]?.taskListColumnWidths ?? {},
      rowHeights: store[profileId]?.taskListRowHeights ?? {},
      detailPanelWidth: store[profileId]?.taskListDetailPanelWidth,
    });
  }

  async saveTaskListLayout(profileId: string, layout: TaskListLayoutPreference) {
    const store = await readStore();
    const timestamp = new Date().toISOString();
    const current = store[profileId];
    const sanitizedLayout = sanitizeTaskListLayoutPreference(layout);
    store[profileId] = {
      quickCreateWidths: sanitizeQuickCreateWidths(current?.quickCreateWidths ?? {}),
      taskListColumnWidths: sanitizedLayout.columnWidths,
      taskListRowHeights: sanitizedLayout.rowHeights,
      taskListDetailPanelWidth: sanitizedLayout.detailPanelWidth,
      themeId: sanitizeThemeId(current?.themeId ?? DEFAULT_THEME_ID),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await writeStore(store);
    return sanitizeTaskListLayoutPreference({
      columnWidths: store[profileId].taskListColumnWidths ?? {},
      rowHeights: store[profileId].taskListRowHeights ?? {},
      detailPanelWidth: store[profileId].taskListDetailPanelWidth,
    });
  }

  async getThemePreference(profileId: string): Promise<ThemePreference> {
    const store = await readStore();
    return {
      themeId: sanitizeThemeId(store[profileId]?.themeId ?? DEFAULT_THEME_ID),
    };
  }

  async saveThemePreference(profileId: string, themeId: ThemeId): Promise<ThemePreference> {
    const store = await readStore();
    const timestamp = new Date().toISOString();
    const current = store[profileId];
    const nextThemeId = sanitizeThemeId(themeId);

    store[profileId] = {
      quickCreateWidths: sanitizeQuickCreateWidths(current?.quickCreateWidths ?? {}),
      taskListColumnWidths: sanitizeTaskListColumnWidths(current?.taskListColumnWidths ?? {}),
      taskListRowHeights: sanitizeTaskListRowHeights(current?.taskListRowHeights ?? {}),
      taskListDetailPanelWidth: sanitizeTaskListLayoutPreference({
        detailPanelWidth: current?.taskListDetailPanelWidth,
      }).detailPanelWidth,
      themeId: nextThemeId,
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await writeStore(store);
    return {
      themeId: sanitizeThemeId(store[profileId].themeId ?? DEFAULT_THEME_ID),
    };
  }
}

export const localPreferenceRepository = new LocalPreferenceRepository();
