import { randomUUID } from "node:crypto";
import type { SongDetail } from "@open-keys/contracts";
import { buildMidi, scale } from "@open-keys/core/testing";
import type { APIRequestContext } from "@playwright/test";
import { ADMIN, WEB_URL } from "./env";

/** State-changing requests must come from the app's origin (CSRF protection of the API). */
const ORIGIN = { Origin: WEB_URL };

/** Logs in the browser context of `request` (the session cookie is shared with its pages). */
export async function login(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/login", { data: ADMIN, headers: ORIGIN });
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }
}

/** Imports and confirms a two-hand song of `seconds` (generated MIDI, no copyrighted file). */
export async function importSong(
  request: APIRequestContext,
  title: string,
  seconds = 20,
): Promise<SongDetail> {
  const notes = Math.round(seconds * 2);
  // A unique name inside the file: the API rejects a file already in the catalogue (same bytes), and
  // every test, in every browser, imports its own song into the shared database.
  const midi = buildMidi(
    [{ notes: scale(64, notes) }, { channel: 1, notes: scale(40, Math.round(notes / 2)) }],
    `${title} ${randomUUID()}`,
  );
  const draft = await request.post("/api/imports/file", {
    headers: ORIGIN,
    multipart: { file: { name: `${title}.mid`, mimeType: "audio/midi", buffer: Buffer.from(midi) } },
  });
  if (!draft.ok()) {
    throw new Error(`Import failed: ${draft.status()} ${await draft.text()}`);
  }
  const song = (await draft.json()) as SongDetail;
  const confirmed = await request.post(`/api/imports/${song.id}/confirm`, {
    headers: ORIGIN,
    data: {
      title,
      composer: null,
      difficulty: null,
      license: null,
      tags: [],
      handMode: song.handMode,
      splitPitch: song.splitPitch,
      tracks: song.tracks.map((track) => ({ id: track.id, hand: track.hand })),
    },
  });
  if (!confirmed.ok()) {
    throw new Error(`Confirmation failed: ${confirmed.status()} ${await confirmed.text()}`);
  }
  return (await confirmed.json()) as SongDetail;
}
