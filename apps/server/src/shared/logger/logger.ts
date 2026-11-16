type LogContext = Readonly<Record<string, unknown>>;

function write(level: "info" | "warn" | "error", message: string, context?: LogContext): void {
  const entry = { level, time: new Date().toISOString(), message, ...context };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
