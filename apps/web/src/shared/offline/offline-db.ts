import type { SongDetail } from "@open-keys/contracts";
import type { PersistedClient } from "@tanstack/query-persist-client-core";
import { Dexie, type EntityTable } from "dexie";

/** MIDI file of a song kept on the device, with the song as it was last seen (offline catalogue). */
export interface CachedMidi {
  readonly songId: string;
  readonly bytes: Uint8Array;
  readonly song: SongDetail;
  readonly cachedAt: number;
}

/** Write waiting to be sent to the API (idempotent PUT: only the latest one per path matters). */
export interface OutboxEntry {
  readonly id: string;
  readonly path: string;
  readonly body: unknown;
  readonly createdAt: number;
  readonly attempts: number;
  readonly lastError: string | null;
}

/** Last state of the TanStack Query cache, restored at startup (offline reads). */
export interface PersistedQueryCache {
  readonly id: "query-cache";
  readonly client: PersistedClient;
}

/** IndexedDB of the app (docs/04-database.md, local storage). */
export class OfflineDb extends Dexie {
  midiFiles!: EntityTable<CachedMidi, "songId">;
  outbox!: EntityTable<OutboxEntry, "id">;
  queryCache!: EntityTable<PersistedQueryCache, "id">;

  constructor(name = "open-keys") {
    super(name);
    this.version(1).stores({
      midiFiles: "songId",
      outbox: "id, path, createdAt",
      queryCache: "id",
    });
  }

  /** Everything of the previous session (logout). */
  async clearAll(): Promise<void> {
    await Promise.all([this.midiFiles.clear(), this.outbox.clear(), this.queryCache.clear()]);
  }
}

export const offlineDb = new OfflineDb();
