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
import { useCallback } from "react";
import { z } from "zod";
import { currentUserQuery, LoginPage } from "../features/auth";
import { CatalogPage, type CatalogSearch, catalogSearchSchema, SongDetailPage } from "../features/catalog";
import { ImportPage, ImportReviewPage, SongEditPage } from "../features/import";
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
  component: AppShell,
});

const catalogRoute = createRoute({
  getParentRoute: () => appRoute,
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
  getParentRoute: () => appRoute,
  path: "/songs/$songId",
  component: function SongRoute() {
    return <SongDetailPage songId={songRoute.useParams().songId} />;
  },
});

const songEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/songs/$songId/edit",
  component: function SongEditRoute() {
    return <SongEditPage songId={songEditRoute.useParams().songId} />;
  },
});

const importRoute = createRoute({ getParentRoute: () => appRoute, path: "/import", component: ImportPage });

const importReviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/import/$songId",
  component: function ImportReviewRoute() {
    return <ImportReviewPage songId={importReviewRoute.useParams().songId} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([catalogRoute, songRoute, songEditRoute, importRoute, importReviewRoute]),
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
