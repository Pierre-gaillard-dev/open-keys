import type { RouterHistory } from "@tanstack/react-router";
import { currentUserQuery } from "../features/auth";
import { createQueryClient } from "./query-client";
import { type AppRouter, createAppRouter } from "./router";

/** Query client + router, wired so that a 401 anywhere sends the user back to the login page. */
export function createApp(history?: RouterHistory) {
  let router: AppRouter | undefined;
  const queryClient = createQueryClient(() => {
    queryClient.setQueryData(currentUserQuery.queryKey, null);
    void router?.invalidate();
  });
  router = createAppRouter(queryClient, history);
  return { queryClient, router };
}
