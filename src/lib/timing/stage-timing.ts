export type StageTiming = {
  name: string;
  durationMs: number;
};

export type StageTimingRecorder = (name: string, durationMs: number) => void;

export function nowForStageTiming() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export async function timeStage<T>(record: StageTimingRecorder | undefined, name: string, task: () => Promise<T>) {
  if (!record) {
    return task();
  }

  const start = nowForStageTiming();
  try {
    return await task();
  } finally {
    record(name, nowForStageTiming() - start);
  }
}

export function timeStageSync<T>(record: StageTimingRecorder | undefined, name: string, task: () => T) {
  if (!record) {
    return task();
  }

  const start = nowForStageTiming();
  try {
    return task();
  } finally {
    record(name, nowForStageTiming() - start);
  }
}

export function createStageTimingCollector() {
  const timings: StageTiming[] = [];
  const record: StageTimingRecorder = (name, durationMs) => {
    timings.push({ name, durationMs: Math.max(0, durationMs) });
  };

  return { record, timings };
}

export function formatServerTimingHeader(timings: readonly StageTiming[]) {
  return timings
    .map((timing) => `${sanitizeServerTimingName(timing.name)};dur=${timing.durationMs.toFixed(1)}`)
    .join(", ");
}

function sanitizeServerTimingName(name: string) {
  return name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "stage";
}
