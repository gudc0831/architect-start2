"use client";

import { createContext, useContext } from "react";

type AuthUser = {
  id: string;
  name: string;
  role: "local_owner";
};

const defaultUser: AuthUser = {
  id: "local-user",
  name: "Local User",
  role: "local_owner",
};

const AuthContext = createContext<AuthUser>(defaultUser);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={defaultUser}>{children}</AuthContext.Provider>;
}

export function useAuthUser() {
  return useContext(AuthContext);
}
