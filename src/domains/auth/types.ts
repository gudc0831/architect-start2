export type AuthRole = "guest" | "local_owner" | "member";

export type AuthUser = {
  id: string;
  name: string;
  role: AuthRole;
};