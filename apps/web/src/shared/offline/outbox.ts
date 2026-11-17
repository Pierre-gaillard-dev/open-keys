import { onlineManager } from "@tanstack/react-query";
import { createStore, useStore } from "zustand";
import { ApiError, apiRequest, isNetworkError } from "../api";
import { newId } from "../lib/ids";
import { isOnline } from "./connectivity";
import type { OfflineDb, OutboxEntry } from "./offline-db";

/** Retry delay for the writes waiting in the outbox (UC-15). */
export const OUTBOX_RETRY_INTERVAL_MS = 60_000;

export interface OutboxSyncState {
  /** Writes not yet accepted by the server. */
  readonly pending: number;
}

export interface OutboxOptions {
  /** A write was accepted by the server: its data can be refreshed. */
  readonly onSynced?: () => void;
  /** The session expired: writes stay queued until the user logs in again. */
  readonly onUnauthorized?: () => void;
}

type SendOutcome = "sent" | "dropped" | "stop";

/**
 * Local queue of the practice writes (settings, loops, sessions): written to IndexedDB first, then
 * sent in order. Every write is an idempotent PUT, and only the latest one per path is kept (the
 * server applies last-write-wins on updatedAt). Sent at startup, when the network comes back, every
 * 60 s and right after each new write.
 */
export class Outbox {
  readonly #db: OfflineDb;
  #options: OutboxOptions;
  readonly #state = createStore<OutboxSyncState>(() => ({ pending: 0 }));
  #flushing: Promise<void> | null = null;
  /** A flush was requested while one was running: run again once it ends (it may have stopped early). */
  #flushAgain = false;

  constructor(db: OfflineDb, options: OutboxOptions = {}) {
    this.#db = db;
    this.#options = options;
  }

  get state() {
    return this.#state;
  }

  /** Callbacks wired by the app (query cache refresh, login redirect). */
  configure(options: OutboxOptions): void {
    this.#options = options;
  }

  /** Queues a PUT (replacing an older one on the same path) and tries to send it. */
  async put(path: string, body: unknown): Promise<void> {
    await this.#db.transaction("rw", this.#db.outbox, async () => {
      await this.#db.outbox.where("path").equals(path).delete();
      await this.#db.outbox.add({
        id: newId(),
        path,
        body,
        createdAt: Date.now(),
        attempts: 0,
        lastError: null,
      });
    });
    await this.#refreshCount();
    void this.flush();
  }

  /**
   * Sends the queued writes in order; stops at the first one that cannot reach the server. A write
   * leaves the queue only once accepted: one cut off by the page closing is sent at the next startup.
   */
  flush(): Promise<void> {
    if (this.#flushing) {
      this.#flushAgain = true;
      return this.#flushing;
    }
    const run = async () => {
      do {
        this.#flushAgain = false;
        await this.#flushAll();
      } while (this.#flushAgain);
    };
    this.#flushing = run().finally(() => {
      this.#flushing = null;
    });
    return this.#flushing;
  }

  /**
   * Flushes at startup, as soon as the app is back online (browser event or API probe, see
   * connectivity.ts) and every 60 s. Returns a stop function.
   */
  start(intervalMs = OUTBOX_RETRY_INTERVAL_MS): () => void {
    const flush = () => void this.flush();
    const unsubscribe = onlineManager.subscribe((online) => {
      if (online) {
        flush();
      }
    });
    const timer = setInterval(flush, intervalMs);
    void this.#refreshCount().then(flush);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }

  async clear(): Promise<void> {
    await this.#flushing;
    await this.#db.outbox.clear();
    await this.#refreshCount();
  }

  async #flushAll(): Promise<void> {
    let synced = false;
    // Oldest first, read again each time: writes queued during the flush are sent by the same flush.
    for (let entry = await this.#oldest(); entry !== undefined; entry = await this.#oldest()) {
      const outcome = await this.#send(entry);
      if (outcome === "stop") {
        break;
      }
      // By id: a newer write queued on the same path meanwhile stays in the queue.
      await this.#db.outbox.delete(entry.id);
      synced ||= outcome === "sent";
    }
    await this.#refreshCount();
    if (synced) {
      this.#options.onSynced?.();
    }
  }

  #oldest(): Promise<OutboxEntry | undefined> {
    return this.#db.outbox.orderBy("createdAt").first();
  }

  async #send(entry: OutboxEntry): Promise<SendOutcome> {
    if (!isOnline()) {
      return "stop";
    }
    try {
      await apiRequest("PUT", entry.path, { body: entry.body });
      return "sent";
    } catch (error) {
      if (!(error instanceof ApiError) || isNetworkError(error) || isRetryable(error.status)) {
        await this.#db.outbox.update(entry.id, {
          attempts: entry.attempts + 1,
          lastError: error instanceof Error ? error.message : String(error),
        });
        return "stop";
      }
      if (error.status === 401) {
        this.#options.onUnauthorized?.();
        return "stop";
      }
      // Rejected by the server (validation): retrying would fail forever and block the queue.
      return "dropped";
    }
  }

  async #refreshCount(): Promise<void> {
    this.#state.setState({ pending: await this.#db.outbox.count() });
  }
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export function useOutboxPending(outbox: Outbox): number {
  return useStore(outbox.state, (state) => state.pending);
}
