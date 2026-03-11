import type { FileRepository, ProjectRepository, TaskRepository } from "@/repositories/contracts";
import {
  firestoreFileRepository,
  firestoreTaskRepository,
} from "@/repositories/firestore/store";
import { localProjectRepository } from "@/repositories/local/project-store";
import { memoryFileRepository, memoryTaskRepository } from "@/repositories/memory/store";
import {
  postgresFileRepository,
  postgresProjectRepository,
  postgresTaskRepository,
} from "@/repositories/postgres/store";
import { isFirestoreEnabled, isPostgresPrimary } from "@/lib/runtime-config";

const legacyTaskRepository = (isFirestoreEnabled ? firestoreTaskRepository : memoryTaskRepository) as unknown as TaskRepository;
const legacyFileRepository = (isFirestoreEnabled ? firestoreFileRepository : memoryFileRepository) as unknown as FileRepository;

export const taskRepository: TaskRepository = isPostgresPrimary ? postgresTaskRepository : legacyTaskRepository;
export const fileRepository: FileRepository = isPostgresPrimary ? postgresFileRepository : legacyFileRepository;
export const projectRepository: ProjectRepository = isPostgresPrimary
  ? postgresProjectRepository
  : localProjectRepository;
