"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@/domains/auth/types";
import { previewAuthUser } from "@/lib/preview/demo-data";
import { clearWorkspaceBootstrapCache, fetchWorkspaceBootstrap, isWorkspaceBootstrapPath } from "@/lib/workspace/bootstrap-client";

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
  const shouldUseWorkspaceBootstrap = isWorkspaceBootstrapPath(pathname);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (isPreview) {
      setUser(previewAuthUser);
      setLoading(false);
      return;
    }

    try {
      if (shouldUseWorkspaceBootstrap) {
        const bootstrap = await fetchWorkspaceBootstrap();
        setUser(bootstrap.user);
        return;
      }

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
    }
  }, [isPreview, shouldUseWorkspaceBootstrap]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshUser,
      clearUser: () => {
        clearWorkspaceBootstrapCache();
        setUser(null);
      },
    }),
    [loading, refreshUser, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthContext);
}

export function useAuthUser() {
  return useContext(AuthContext).user;
}
