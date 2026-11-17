/** 202273 → "3:22" */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** 11 520 000 → "3 h 12", 1 080 000 → "18 min", 30 000 → "< 1 min" */
export function formatPracticeTime(ms: number): string {
  if (ms <= 0) {
    return "0 min";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return "< 1 min";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** 3 → "●●●○○" */
export function difficultyDots(difficulty: number | null): string {
  if (difficulty === null) {
    return "—";
  }
  return "●".repeat(difficulty) + "○".repeat(5 - difficulty);
}

const DAY_MS = 24 * 60 * 60_000;

/** "Aujourd'hui", "Hier", "Il y a 5 jours", or a date. */
export function formatRelativeDay(timestamp: number, now: number = Date.now()): string {
  const days = Math.floor(now / DAY_MS) - Math.floor(timestamp / DAY_MS);
  if (days <= 0) {
    return "Aujourd'hui";
  }
  if (days === 1) {
    return "Hier";
  }
  if (days < 7) {
    return `Il y a ${days} jours`;
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
    timestamp,
  );
}
