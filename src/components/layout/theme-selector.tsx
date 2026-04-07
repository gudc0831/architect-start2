"use client";

import clsx from "clsx";
import { isThemeId } from "@/domains/preferences/types";
import { describeTheme, labelForTheme, t } from "@/lib/ui-copy";
import { useTheme } from "@/providers/theme-provider";

export function ThemeSelector() {
  const { themeId, themes, isLoaded, isSaving, error, setThemeId, clearError } = useTheme();
  const statusCopy = isSaving ? t("themes.saving") : error ?? describeTheme(themeId);

  return (
    <div className="sidebar__theme">
      <div className="sidebar__theme-header">
        <span className="sidebar__theme-label">{t("themes.label")}</span>
        {!isLoaded ? <span className="sidebar__theme-badge">{t("system.loading")}</span> : null}
      </div>
      <p className="sidebar__theme-help">{t("themes.helper")}</p>
      <label className="sidebar__theme-field">
        <span className="sr-only">{t("themes.label")}</span>
        <select
          className="sidebar__theme-select"
          disabled={!isLoaded || isSaving}
          onChange={(event) => {
            if (!isThemeId(event.target.value)) {
              return;
            }

            clearError();
            void setThemeId(event.target.value);
          }}
          value={themeId}
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {labelForTheme(theme.id)}
            </option>
          ))}
        </select>
      </label>
      <p className={clsx("sidebar__theme-status", error && "sidebar__theme-status--error")}>{statusCopy}</p>
    </div>
  );
}
