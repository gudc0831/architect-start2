export type FileVersionRecord = {
  id: string;
  fileId: string;
  storedName: string;
  storedPath: string;
  createdAt: string;
};

export type FileLinkRecord = {
  id: string;
  taskId: string;
  fileId: string;
  createdAt: string;
  deletedAt: string | null;
};