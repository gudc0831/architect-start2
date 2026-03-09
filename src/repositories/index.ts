import type { FileRepository, TaskRepository } from "@/repositories/contracts";
import {
  firestoreFileRepository,
  firestoreTaskRepository,
} from "@/repositories/firestore/store";
import { memoryFileRepository, memoryTaskRepository } from "@/repositories/memory/store";
import { isFirestoreEnabled } from "@/lib/runtime-config";

export const taskRepository: TaskRepository = isFirestoreEnabled
  ? firestoreTaskRepository
  : memoryTaskRepository;

export const fileRepository: FileRepository = isFirestoreEnabled
  ? firestoreFileRepository
  : memoryFileRepository;