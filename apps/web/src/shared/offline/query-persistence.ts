import {
  type PersistedClient,
  type Persister,
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/query-persist-client-core";
import type { Query, QueryClient } from "@tanstack/react-query";
import type { OfflineDb } from "./offline-db";

/** Data older than this is not restored (a month without opening the app). */
export const PERSISTED_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/**
 * Persisted queries stay in memory: a garbage-collected query would also disappear from the device.
 * Infinity, not the max age: TanStack schedules gcTime with setTimeout, which fires at once above 24.8 days.
 */
export const PERSISTED_QUERY_GC_TIME_MS = Number.POSITIVE_INFINITY;

const SONG_PARTS: ReadonlySet<unknown> = new Set(["detail", "loops", "practice-stats"]);

/**
 * What is kept for offline use: the user, the tags, the song details, the library, the loops and the
 * practice stats. Not the catalogue lists (one per search; offline, the catalogue lists the songs stored
 * on the device), the parsed timelines (large, rebuilt from the stored MIDI) nor the import screens.
 */
export function isPersistedQueryKey(key: readonly unknown[]): boolean {
  const [root, second, third] = key;
  if (root === "auth" || root === "library" || root === "tags") {
    return true;
  }
  return root === "songs" && second !== "list" && SONG_PARTS.has(third);
}

function shouldPersist(query: Query): boolean {
  return query.state.status === "success" && isPersistedQueryKey(query.queryKey);
}

/** Stores the dehydrated cache as a structured clone in IndexedDB (no JSON round trip). */
export function createIndexedDbPersister(db: OfflineDb): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await db.queryCache.put({ id: "query-cache", client });
    },
    restoreClient: async () => (await db.queryCache.get("query-cache"))?.client,
    removeClient: async () => {
      await db.queryCache.delete("query-cache");
    },
  };
}

/**
 * Restores the last cache (before the first render, so that the route guards see the user even
 * offline), then saves every change. Returns a function that stops saving.
 */
export async function persistQueryCache(queryClient: QueryClient, db: OfflineDb): Promise<() => void> {
  const options = {
    queryClient,
    persister: createIndexedDbPersister(db),
    maxAge: PERSISTED_CACHE_MAX_AGE_MS,
    // Changes with each build: a new version never reads data shaped by an older one.
    buster: String(import.meta.env["VITE_BUILD_ID"] ?? ""),
    dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
  };
  try {
    await persistQueryClientRestore(options);
  } catch {
    // Unreadable cache (private browsing, storage cleared): start from the network.
  }
  return persistQueryClientSubscribe(options);
}
