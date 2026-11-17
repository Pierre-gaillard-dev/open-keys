import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { App } from "../app/App";
import { createApp } from "../app/create-app";

/** Renders the whole app (real router, real queries) at `path`. */
export function renderApp(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const { queryClient, router } = createApp(history);
  const view = render(<App queryClient={queryClient} router={router} />);
  return { ...view, router, history };
}
