import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { Suspense, useCallback } from "react";
import { z } from "zod";
import { currentUserQuery, LoginPage } from "../features/auth";
import { CatalogPage, type CatalogSearch, catalogSearchSchema, SongDetailPage } from "../features/catalog";
import { ImportPage, ImportReviewPage, MutopiaSearchPage, SongEditPage } from "../features/import";
import { PlayerPage } from "../features/player";
import { buttonClasses, ErrorBanner } from "../shared/ui";
import { AppShell } from "./layout/AppShell";

export interface RouterContext {
  readonly queryClient: QueryClient;
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <p className="font-display text-2xl font-bold">Page introuvable</p>
      <Link to="/" className={buttonClasses("primary")}>
        Retour au catalogue
      </Link>
    </div>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl p-6">
      <ErrorBanner error={error} title="Quelque chose s'est mal passé" />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(currentUserQuery)) {
      throw redirect({ to: "/" });
    }
  },
  component: function LoginRoute() {
    const { redirect: redirectTo } = loginRoute.useSearch();
    return <LoginPage redirectTo={redirectTo} />;
  },
});

/** Everything below requires a session. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: Outlet,
});

/** Pages with the top bar (everything but the full-screen player). */
const shellRoute = createRoute({ getParentRoute: () => appRoute, id: "shell", component: AppShell });

const playerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/songs/$songId/play",
  component: function PlayerRoute() {
    return (
      <Suspense fallback={<p className="p-10 text-center text-fg-soft">Ouverture du lecteur…</p>}>
        <PlayerPage songId={playerRoute.useParams().songId} />
      </Suspense>
    );
  },
});

const catalogRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  validateSearch: catalogSearchSchema,
  component: function CatalogRoute() {
    const search = catalogRoute.useSearch();
    const navigate = useNavigate({ from: "/" });
    const onSearchChange = useCallback(
      (next: CatalogSearch) => void navigate({ search: next, replace: true }),
      [navigate],
    );
    return <CatalogPage search={search} onSearchChange={onSearchChange} />;
  },
});

const songRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/songs/$songId",
  component: function SongRoute() {
    return <SongDetailPage songId={songRoute.useParams().songId} />;
  },
});

const songEditRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/songs/$songId/edit",
  component: function SongEditRoute() {
    return <SongEditPage songId={songEditRoute.useParams().songId} />;
  },
});

const importRoute = createRoute({ getParentRoute: () => shellRoute, path: "/import", component: ImportPage });

const mutopiaSearchRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/import/search",
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  component: function MutopiaSearchRoute() {
    const { q } = mutopiaSearchRoute.useSearch();
    const navigate = useNavigate({ from: "/import/search" });
    const onQueryChange = useCallback(
      (next: string) => void navigate({ search: { q: next || undefined }, replace: true }),
      [navigate],
    );
    return <MutopiaSearchPage query={q ?? ""} onQueryChange={onQueryChange} />;
  },
});

const importReviewRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/import/$songId",
  component: function ImportReviewRoute() {
    return <ImportReviewPage songId={importReviewRoute.useParams().songId} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    shellRoute.addChildren([
      catalogRoute,
      songRoute,
      songEditRoute,
      importRoute,
      mutopiaSearchRoute,
      importReviewRoute,
    ]),
    playerRoute,
  ]),
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    ...(history ? { history } : {}),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
