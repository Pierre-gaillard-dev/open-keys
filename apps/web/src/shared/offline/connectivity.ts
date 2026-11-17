import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/** While offline, how often the API is probed to detect that it can be reached again. */
export const PROBE_INTERVAL_MS = 15_000;
const PROBE_URL = "/api/health";

/*
 * Online state shared by the queries (TanStack onlineManager: offline queries are paused and keep
 * their data) and the outbox. Browser events are not enough, a phone can be "online" without reaching
 * the server: a request that cannot reach the API switches to offline, and a probe of /api/health
 * (or the browser coming back online) switches back.
 */

export function reportNetworkFailure(): void {
  onlineManager.setOnline(false);
}

export function reportNetworkSuccess(): void {
  onlineManager.setOnline(true);
}

export function isOnline(): boolean {
  return onlineManager.isOnline();
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}

async function probe(): Promise<void> {
  try {
    const response = await fetch(PROBE_URL, { cache: "no-store" });
    if (response.ok) {
      reportNetworkSuccess();
    }
  } catch {
    // Still offline.
  }
}

/**
 * Starts from the browser's view (TanStack assumes online at startup), then probes the API while
 * offline. Returns a function that stops probing.
 */
export function startConnectivity(intervalMs = PROBE_INTERVAL_MS): () => void {
  if (!navigator.onLine) {
    reportNetworkFailure();
  }
  const timer = setInterval(() => {
    if (!isOnline()) {
      void probe();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
