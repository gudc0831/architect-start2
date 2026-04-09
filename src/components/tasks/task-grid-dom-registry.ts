export type TaskGridCellKey = Readonly<{
  taskId: string;
  columnKey: string;
}>;

export function createTaskGridCellKey(taskId: string, columnKey: string): TaskGridCellKey {
  return { taskId, columnKey };
}

export function areTaskGridCellKeysEqual(previous: TaskGridCellKey | null, next: TaskGridCellKey | null) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.taskId === next.taskId && previous.columnKey === next.columnKey;
}

export type TaskGridDomRegistry = {
  registerCell: (taskId: string, columnKey: string, node: HTMLElement | null) => void;
  getCell: (taskId: string, columnKey: string) => HTMLElement | null;
  clearTask: (taskId: string) => void;
  clear: () => void;
};

function getTaskGridDomRegistryBucket(
  registry: Map<string, Map<string, HTMLElement>>,
  taskId: string,
  createIfMissing: boolean,
) {
  const currentBucket = registry.get(taskId);
  if (currentBucket || !createIfMissing) {
    return currentBucket ?? null;
  }

  const nextBucket = new Map<string, HTMLElement>();
  registry.set(taskId, nextBucket);
  return nextBucket;
}

export function createTaskGridDomRegistry(): TaskGridDomRegistry {
  const registry = new Map<string, Map<string, HTMLElement>>();

  return {
    registerCell(taskId, columnKey, node) {
      const currentBucket = getTaskGridDomRegistryBucket(registry, taskId, Boolean(node));
      if (!currentBucket) {
        return;
      }

      if (node) {
        currentBucket.set(columnKey, node);
        return;
      }

      currentBucket.delete(columnKey);
      if (currentBucket.size === 0) {
        registry.delete(taskId);
      }
    },
    getCell(taskId, columnKey) {
      return registry.get(taskId)?.get(columnKey) ?? null;
    },
    clearTask(taskId) {
      registry.delete(taskId);
    },
    clear() {
      registry.clear();
    },
  };
}
