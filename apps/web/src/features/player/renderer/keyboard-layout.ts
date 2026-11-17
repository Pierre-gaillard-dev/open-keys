import { isBlackKey } from "@open-keys/core";

export const PIANO_LOWEST = 21;
export const PIANO_HIGHEST = 108;
/** Keys added on each side of the piece's range when zoomed. */
const ZOOM_MARGIN = 2;

export interface KeyGeometry {
  readonly pitch: number;
  readonly x: number;
  readonly width: number;
  readonly isBlack: boolean;
}

export interface KeyboardLayout {
  readonly low: number;
  readonly high: number;
  readonly keys: ReadonlyMap<number, KeyGeometry>;
}

/** Widens a range so it starts and ends on white keys, inside the 88-key piano. */
export function widenToWhiteKeys(low: number, high: number): [number, number] {
  let from = Math.max(PIANO_LOWEST, low);
  let to = Math.min(PIANO_HIGHEST, high);
  while (from > PIANO_LOWEST && isBlackKey(from)) {
    from--;
  }
  while (to < PIANO_HIGHEST && isBlackKey(to)) {
    to++;
  }
  return [from, to];
}

/** Range shown by the keyboard: the whole piano, or the piece's notes (+ margin) when zoomed. */
export function visibleRange(zoom: boolean, minPitch: number, maxPitch: number): [number, number] {
  return zoom
    ? widenToWhiteKeys(minPitch - ZOOM_MARGIN, maxPitch + ZOOM_MARGIN)
    : [PIANO_LOWEST, PIANO_HIGHEST];
}

/** Geometry of every key of [low, high] spread over `width` pixels (black keys are 60 % wide). */
export function computeKeyboardLayout(low: number, high: number, width: number): KeyboardLayout {
  const [from, to] = widenToWhiteKeys(low, high);
  let whiteCount = 0;
  for (let pitch = from; pitch <= to; pitch++) {
    if (!isBlackKey(pitch)) {
      whiteCount++;
    }
  }
  const whiteWidth = width / whiteCount;
  const blackWidth = whiteWidth * 0.6;
  const keys = new Map<number, KeyGeometry>();
  let whiteIndex = 0;
  for (let pitch = from; pitch <= to; pitch++) {
    if (isBlackKey(pitch)) {
      keys.set(pitch, {
        pitch,
        x: whiteIndex * whiteWidth - blackWidth / 2,
        width: blackWidth,
        isBlack: true,
      });
    } else {
      keys.set(pitch, { pitch, x: whiteIndex * whiteWidth, width: whiteWidth, isBlack: false });
      whiteIndex++;
    }
  }
  return { low: from, high: to, keys };
}
