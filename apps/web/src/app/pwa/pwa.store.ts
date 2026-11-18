import { createStore } from "zustand";

export interface PendingUpdate {
  /** Activates the waiting version and reloads the page. */
  readonly apply: () => Promise<void>;
  /** Page shown when the new version was found (path, query, hash): applied once the user has left it. */
  readonly href: string;
}

export interface PwaState {
  /** Set when a new version is installed and waiting. */
  readonly update: PendingUpdate | null;
}

export const pwaStore = createStore<PwaState>(() => ({ update: null }));

/** Same form as the router's `location.href`. */
export function currentHref(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}
