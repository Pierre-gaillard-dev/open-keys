import { createLogger, type Logger, type LogLevel } from "../shared/logger";

export interface LoggedEntry {
  readonly level: LogLevel;
  readonly entry: Record<string, unknown>;
}

/** Logger that keeps every entry in memory, for assertions. */
export function createMemoryLogger(level: LogLevel = "debug"): { logger: Logger; entries: LoggedEntry[] } {
  const entries: LoggedEntry[] = [];
  const logger = createLogger({
    level,
    sink: (entryLevel, line) => entries.push({ level: entryLevel, entry: JSON.parse(line) }),
  });
  return { logger, entries };
}
