import { queryOptions, useQuery } from "@tanstack/react-query";
import { startOfWeek, WEEKS_SHOWN } from "../progress-stats";
import { fetchPracticeHistory } from "./progress.api";

/** One key whatever the day: a single entry, kept for offline use like the other practice data. */
export const practiceHistoryQuery = queryOptions({
  queryKey: ["practice", "history"] as const,
  queryFn: () => {
    // From the Monday of the oldest week shown (12 weeks also cover the 30 days).
    const from = startOfWeek(Date.now());
    from.setDate(from.getDate() - (WEEKS_SHOWN - 1) * 7);
    return fetchPracticeHistory(from.getTime());
  },
});

export function usePracticeHistory() {
  return useQuery(practiceHistoryQuery);
}
