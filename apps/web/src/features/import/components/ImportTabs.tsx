import { Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";

/** Same look as the main navigation: TanStack Router marks the active link with data-status. */
const TAB =
  "-mb-px border-b-2 border-transparent pb-2.5 text-sm text-fg-muted transition-colors hover:text-fg data-[status=active]:border-fg data-[status=active]:font-semibold data-[status=active]:text-fg";

/** The two ways to import (mockups): tabs on a large screen. */
export function ImportTabs() {
  return (
    <nav aria-label="Mode d'import" className="hidden gap-8 border-b border-line md:flex">
      <Link to="/import" activeOptions={{ exact: true }} className={TAB}>
        Fichier ou URL
      </Link>
      <Link to="/import/search" className={TAB}>
        Rechercher en ligne
      </Link>
    </nav>
  );
}

/** On a phone, the online search is an entry at the top of the import page (mockup mobile-04). */
export function OnlineSearchEntry() {
  return (
    <Link
      to="/import/search"
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 md:hidden"
    >
      <Search aria-hidden="true" className="size-5 shrink-0 text-fg-soft" />
      <span className="flex flex-1 flex-col">
        <span className="font-semibold">Rechercher en ligne</span>
        <span className="text-sm text-fg-muted">Mutopia, MAESTRO, xivmidi</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 text-fg-muted" />
    </Link>
  );
}
