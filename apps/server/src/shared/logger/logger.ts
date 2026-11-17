export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogContext = Readonly<Record<string, unknown>>;

/** Receives one formatted JSON line. Injected in tests; defaults to the console. */
export type LogSink = (level: LogLevel, line: string) => void;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Logger whose entries always include the given context (e.g. a request id). */
  child(context: LogContext): Logger;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  readonly sink?: LogSink;
  readonly context?: LogContext;
}

const consoleSink: LogSink = (level, line) => {
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
};

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function serializeContext(context: LogContext): Record<string, unknown> {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, serializeValue(value)]));
}

export function createLogger({ level, sink = consoleSink, context = {} }: LoggerOptions): Logger {
  const threshold = LOG_LEVELS.indexOf(level);

  const write = (entryLevel: LogLevel, message: string, extra: LogContext = {}): void => {
    if (LOG_LEVELS.indexOf(entryLevel) < threshold) {
      return;
    }
    const entry = {
      level: entryLevel,
      time: new Date().toISOString(),
      message,
      ...serializeContext(context),
      ...serializeContext(extra),
    };
    sink(entryLevel, JSON.stringify(entry));
  };

  return {
    debug: (message, extra) => write("debug", message, extra),
    info: (message, extra) => write("info", message, extra),
    warn: (message, extra) => write("warn", message, extra),
    error: (message, extra) => write("error", message, extra),
    child: (extra) => createLogger({ level, sink, context: { ...context, ...extra } }),
  };
}
