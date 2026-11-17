import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useCurrentUser, useLogout } from "../../features/auth";
import { IconButton } from "../../shared/ui";
import { UpdateBanner } from "../pwa/UpdateBanner";

/** TanStack Router marks the active link with data-status="active" (and aria-current). */
const NAV_LINK =
  "-mb-px flex items-center border-b-2 border-transparent text-sm text-fg-muted transition-colors hover:text-fg data-[status=active]:border-fg data-[status=active]:font-semibold data-[status=active]:text-fg";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
        <span className="h-3 w-1.5 rounded-sm bg-hand-left" />
        <span className="h-5 w-1.5 rounded-sm bg-hand-right" />
        <span className="h-2 w-1.5 rounded-sm bg-hand-left" />
      </span>
      <span className="font-display text-lg font-bold">Open Keys</span>
    </Link>
  );
}

/** Top bar (no sidebar, see the mockups) + current page. */
export function AppShell() {
  const user = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col">
      <UpdateBanner />
      <header className="flex h-16 shrink-0 items-stretch gap-8 border-b border-surface-2 px-4 md:px-10">
        <Logo />
        <nav aria-label="Navigation principale" className="hidden items-stretch gap-7 md:flex">
          <Link to="/" className={NAV_LINK} activeOptions={{ includeSearch: false }}>
            Catalogue
          </Link>
          <Link to="/import" className={NAV_LINK}>
            Importer
          </Link>
        </nav>
        <div className="flex flex-1 items-center justify-end gap-3">
          {user.data && <span className="hidden text-sm text-fg-muted sm:inline">{user.data.username}</span>}
          <IconButton
            label="Se déconnecter"
            onClick={() => logout.mutate(undefined, { onSettled: () => void navigate({ to: "/login" }) })}
          >
            <LogOut aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
