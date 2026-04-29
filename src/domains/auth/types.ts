export type AuthRole = "admin" | "member";
export type AuthAccessStatus = "active" | "pending" | "disabled";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  name: string;
  role: AuthRole;
  accessStatus: AuthAccessStatus;
};
