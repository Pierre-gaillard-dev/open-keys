import { describe, expect, it } from "vitest";
import { createLogger, type LogLevel } from "./logger";

function memoryLogger(level: LogLevel) {
  const lines: { level: LogLevel; entry: Record<string, unknown> }[] = [];
  const logger = createLogger({
    level,
    sink: (lineLevel, line) => lines.push({ level: lineLevel, entry: JSON.parse(line) }),
  });
  return { logger, lines };
}

describe("createLogger", () => {
  it("writes JSON lines with level, time, message and context", () => {
    const { logger, lines } = memoryLogger("debug");

    logger.info("hello", { port: 3000 });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry).toMatchObject({ level: "info", message: "hello", port: 3000 });
    expect(typeof lines[0]?.entry["time"]).toBe("string");
  });

  it("drops entries below the configured level", () => {
    const { logger, lines } = memoryLogger("warn");

    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(lines.map((line) => line.level)).toEqual(["warn", "error"]);
  });

  it("merges the context of child loggers", () => {
    const { logger, lines } = memoryLogger("info");

    logger.child({ requestId: "r1" }).child({ userId: "u1" }).info("nested", { extra: true });

    expect(lines[0]?.entry).toMatchObject({ requestId: "r1", userId: "u1", extra: true });
  });

  it("serializes errors with their stack", () => {
    const { logger, lines } = memoryLogger("info");

    logger.error("boom", { error: new TypeError("bad") });

    expect(lines[0]?.entry["error"]).toMatchObject({ name: "TypeError", message: "bad" });
    expect(JSON.stringify(lines[0]?.entry["error"])).toContain("stack");
  });
});
