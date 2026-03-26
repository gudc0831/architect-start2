export type AuthRole = "admin" | "member";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  name: string;
  role: AuthRole;
};
