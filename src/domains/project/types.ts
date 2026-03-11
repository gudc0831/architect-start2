export type ProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: "postgres" | "local-file" | "firestore";
};
