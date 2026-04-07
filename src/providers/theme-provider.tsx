"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_THEME_ID,
  orderedThemeDefinitions,
  sanitizeThemePreference,
  type ThemeDefinition,
  type ThemeId,
} from "@/domains/preferences/types";
import { t } from "@/lib/ui-copy";
import { useAuthState } from "@/providers/auth-provider";

type ThemeContextValue = {
  themeId: ThemeId;
  themes: readonly ThemeDefinition[];
  isLoaded: boolean;
  isSaving: boolean;
  error: string | null;
  setThemeId: (themeId: ThemeId) => Promise<void>;
  clearError: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  themes: orderedThemeDefinitions,
  isLoaded: false,
  isSaving: false,
  error: null,
  setThemeId: async () => {},
  clearError: () => {},
});

async function readThemePreference() {
  const response = await fetch("/api/preferences/theme", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("theme preference request failed");
  }

  const json = (await response.json()) as { data?: unknown };
  return sanitizeThemePreference(json.data);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuthState();
  const isPreview = pathname.startsWith("/preview");
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = themeId;
  }, [themeId]);

  useEffect(() => {
    if (isPreview) {
      setThemeIdState(DEFAULT_THEME_ID);
      setIsLoaded(true);
      setError(null);
      return;
    }

    if (authLoading) {
      return;
    }

    if (!user) {
      setThemeIdState(DEFAULT_THEME_ID);
      setIsLoaded(true);
      setError(null);
      return;
    }

    let isActive = true;
    setIsLoaded(false);

    void readThemePreference()
      .then((preference) => {
        if (!isActive) {
          return;
        }

        setThemeIdState(preference.themeId);
        setError(null);
        setIsLoaded(true);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setThemeIdState(DEFAULT_THEME_ID);
        setError(null);
        setIsLoaded(true);
      });

    return () => {
      isActive = false;
    };
  }, [authLoading, isPreview, user]);

  const setThemeId = useCallback(async (nextThemeId: ThemeId) => {
    if (isPreview || !user) {
      return;
    }

    const previousThemeId = themeId;

    setThemeIdState(nextThemeId);
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/preferences/theme", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: nextThemeId }),
      });

      if (!response.ok) {
        throw new Error("theme preference save failed");
      }

      const json = (await response.json()) as { data?: unknown };
      const preference = sanitizeThemePreference(json.data);
      setThemeIdState(preference.themeId);
    } catch {
      setThemeIdState(previousThemeId);
      setError(t("themes.saveFailed"));
    } finally {
      setIsSaving(false);
      setIsLoaded(true);
    }
  }, [isPreview, themeId, user]);

  const value = useMemo(
    () => ({
      themeId,
      themes: orderedThemeDefinitions,
      isLoaded,
      isSaving,
      error,
      setThemeId,
      clearError: () => setError(null),
    }),
    [error, isLoaded, isSaving, setThemeId, themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
