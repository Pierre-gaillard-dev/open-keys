import { buildMidi, scale } from "@open-keys/core/testing";
import sharp from "sharp";

/** Two-hand piece: right hand (high track) and left hand. */
export function twoHandMidi(title = "", seed = 0): Uint8Array {
  return buildMidi(
    [
      { name: "Right hand", notes: scale(64 + seed, 8) },
      { name: "Left hand", channel: 1, notes: scale(40 + seed, 4) },
    ],
    title,
  );
}

/** Single-track piece (split by pitch on import). */
export function singleTrackMidi(seed = 0): Uint8Array {
  return buildMidi([{ notes: scale(55 + seed, 10) }]);
}

/** A real PNG image of the given size. */
export async function pngImage(width = 1000, height = 600): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 43, g: 58, b: 85 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}
