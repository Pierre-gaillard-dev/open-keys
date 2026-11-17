import { lazy } from "react";

/*
 * The import screens (review, covers, online search with the MIDI preview) are loaded on demand:
 * starting the app on the catalogue or the player never downloads them. To be rendered inside a
 * Suspense boundary (the app shell has one).
 */

export const ImportPage = lazy(() =>
  import("./pages/ImportPage").then((module) => ({ default: module.ImportPage })),
);

export const ImportReviewPage = lazy(() =>
  import("./pages/ImportReviewPage").then((module) => ({ default: module.ImportReviewPage })),
);

export const SongEditPage = lazy(() =>
  import("./pages/SongEditPage").then((module) => ({ default: module.SongEditPage })),
);

export const MutopiaSearchPage = lazy(() =>
  import("./pages/MutopiaSearchPage").then((module) => ({ default: module.MutopiaSearchPage })),
);
