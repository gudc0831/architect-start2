"use client";

import { createContext, useContext } from "react";
import type { AuthUser } from "@/domains/auth/types";

const defaultUser: AuthUser = {
  id: "local-user",
  name: "로컬 사용자",
  role: "local_owner",
};

const AuthContext = createContext<AuthUser>(defaultUser);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={defaultUser}>{children}</AuthContext.Provider>;
}

export function useAuthUser() {
  return useContext(AuthContext);
}