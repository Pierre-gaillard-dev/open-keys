import type { RouterHistory } from "@tanstack/react-router";
import { currentUserQuery } from "../features/auth";
import { outbox } from "../shared/offline";
import { createQueryClient } from "./query-client";
import { type AppRouter, createAppRouter } from "./router";

/**
 * Query client + router, wired so that a 401 anywhere (queries or queued writes) sends the user back
 * to the login page, and so that data is refreshed once queued writes reach the server.
 */
export function createApp(history?: RouterHistory) {
  let router: AppRouter | undefined;
  const onUnauthorized = () => {
    queryClient.setQueryData(currentUserQuery.queryKey, null);
    void router?.invalidate();
  };
  const queryClient = createQueryClient(onUnauthorized);
  router = createAppRouter(queryClient, history);
  outbox.configure({
    onUnauthorized,
    onSynced: () => {
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["songs"] });
    },
  });
  return { queryClient, router };
}
