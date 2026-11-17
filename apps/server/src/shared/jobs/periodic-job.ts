import type { Logger } from "../logger";

export interface PeriodicJob {
  stop(): void;
}

/**
 * Runs `task` shortly after startup, then every `intervalMs`. Runs never overlap and a failure
 * is logged without stopping the schedule.
 */
export function startPeriodicJob(
  name: string,
  intervalMs: number,
  task: () => Promise<unknown>,
  logger: Logger,
  initialDelayMs = 5000,
): PeriodicJob {
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await task();
    } catch (error) {
      logger.error("Periodic job failed", { job: name, error });
    } finally {
      running = false;
    }
  };
  const first = setTimeout(() => void run(), initialDelayMs);
  const timer = setInterval(() => void run(), intervalMs);
  first.unref();
  timer.unref();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(timer);
    },
  };
}
