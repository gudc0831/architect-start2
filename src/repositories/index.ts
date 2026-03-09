import type { FileRepository, ProjectRepository, TaskRepository } from "@/repositories/contracts";
import {
  firestoreFileRepository,
  firestoreTaskRepository,
} from "@/repositories/firestore/store";
import { localProjectRepository } from "@/repositories/local/project-store";
import { memoryFileRepository, memoryTaskRepository } from "@/repositories/memory/store";
import { isFirestoreEnabled } from "@/lib/runtime-config";

export const taskRepository: TaskRepository = isFirestoreEnabled
  ? firestoreTaskRepository
  : memoryTaskRepository;

export const fileRepository: FileRepository = isFirestoreEnabled
  ? firestoreFileRepository
  : memoryFileRepository;

export const projectRepository: ProjectRepository = localProjectRepository;