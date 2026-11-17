import { type PracticeHistory, practiceHistorySchema } from "@open-keys/contracts";
import { apiRequest } from "../../../shared/api";

/** Practice sessions started since `from` (UC-27). */
export function fetchPracticeHistory(from: number): Promise<PracticeHistory> {
  return apiRequest("GET", "/practice-sessions", { query: { from }, schema: practiceHistorySchema });
}
