"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@/domains/auth/types";
import { previewAuthUser } from "@/lib/preview/demo-data";
import { clearWorkspaceBootstrapCache } from "@/lib/workspace/bootstrap-client";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  clearUser: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => {},
  clearUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const isPublicAuthPath = pathname === "/login" || pathname.startsWith("/auth/");
  const authMode = isPreview ? "preview" : isPublicAuthPath ? "public" : "workspace";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedAuthMode, setResolvedAuthMode] = useState<typeof authMode | null>(null);

  const refreshUser = useCallback(async () => {
    if (isPreview) {
      setUser(previewAuthUser);
      setLoading(false);
      setResolvedAuthMode("preview");
      return;
    }

    if (isPublicAuthPath) {
      setUser(null);
      setLoading(false);
      setResolvedAuthMode("public");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        setUser(null);
        return;
      }

      const json = (await response.json()) as { data: AuthUser };
      setUser(json.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
      setResolvedAuthMode("workspace");
    }
  }, [isPreview, isPublicAuthPath]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const effectiveLoading = authMode === "workspace" && resolvedAuthMode !== "workspace" ? true : loading;

  const value = useMemo(
    () => ({
      user,
      loading: effectiveLoading,
      refreshUser,
      clearUser: () => {
        clearWorkspaceBootstrapCache();
        setUser(null);
      },
    }),
    [effectiveLoading, refreshUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthContext);
}

export function useAuthUser() {
  return useContext(AuthContext).user;
}
