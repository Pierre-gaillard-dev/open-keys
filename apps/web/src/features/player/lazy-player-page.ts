import { lazy } from "react";

/**
 * The full-screen player (PixiJS) is loaded on demand: importing this feature (for the preview)
 * never downloads it. To be rendered inside a Suspense boundary.
 */
export const PlayerPage = lazy(() =>
  import("./pages/PlayerPage").then((module) => ({ default: module.PlayerPage })),
);
