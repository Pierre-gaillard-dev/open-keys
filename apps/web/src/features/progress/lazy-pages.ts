import { lazy } from "react";

/** The practice dashboard is loaded on demand. To be rendered inside a Suspense boundary (app shell). */
export const ProgressPage = lazy(() =>
  import("./pages/ProgressPage").then((module) => ({ default: module.ProgressPage })),
);
