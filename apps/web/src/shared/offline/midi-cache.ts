import type { SongDetail } from "@open-keys/contracts";
import { apiBytes } from "../api";
import type { OfflineDb } from "./offline-db";

/**
 * MIDI files kept on the device (UC-14): stored when a song is opened or marked as favorite, read
 * from IndexedDB afterwards. The file of a song never changes (the hand mapping lives in the song),
 * so a stored file is always valid; only the song snapshot is refreshed.
 */
export class MidiCache {
  readonly #db: OfflineDb;

  constructor(db: OfflineDb) {
    this.#db = db;
  }

  /** The MIDI of the song, from the device if available, otherwise downloaded and stored. */
  async get(song: SongDetail): Promise<Uint8Array> {
    const cached = await this.#db.midiFiles.get(song.id);
    if (cached) {
      if (cached.song.updatedAt < song.updatedAt) {
        await this.#db.midiFiles.update(song.id, { song });
      }
      return cached.bytes;
    }
    const bytes = await apiBytes(song.midiUrl);
    await this.#db.midiFiles.put({ songId: song.id, bytes, song, cachedAt: Date.now() });
    return bytes;
  }

  async has(songId: string): Promise<boolean> {
    return (await this.#db.midiFiles.where("songId").equals(songId).count()) > 0;
  }

  /** Songs playable without network (offline catalogue). */
  async songs(): Promise<SongDetail[]> {
    return (await this.#db.midiFiles.toArray()).map((entry) => entry.song);
  }

  async remove(songId: string): Promise<void> {
    await this.#db.midiFiles.delete(songId);
  }
}
