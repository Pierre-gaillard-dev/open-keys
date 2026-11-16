import { isBlackKey } from "@open-keys/core";

export const PIANO_LOWEST = 21;
export const PIANO_HIGHEST = 108;

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
  readonly whiteKeyWidth: number;
}

function widenToWhiteKeys(low: number, high: number): [number, number] {
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

export function computeKeyboardLayout(low: number, high: number, width: number): KeyboardLayout {
  const [from, to] = widenToWhiteKeys(low, high);
  let whiteCount = 0;
  for (let pitch = from; pitch <= to; pitch++) {
    if (!isBlackKey(pitch)) {
      whiteCount++;
    }
  }
  const whiteKeyWidth = width / whiteCount;
  const blackKeyWidth = whiteKeyWidth * 0.6;
  const keys = new Map<number, KeyGeometry>();
  let whiteIndex = 0;
  for (let pitch = from; pitch <= to; pitch++) {
    if (isBlackKey(pitch)) {
      keys.set(pitch, {
        pitch,
        x: whiteIndex * whiteKeyWidth - blackKeyWidth / 2,
        width: blackKeyWidth,
        isBlack: true,
      });
    } else {
      keys.set(pitch, { pitch, x: whiteIndex * whiteKeyWidth, width: whiteKeyWidth, isBlack: false });
      whiteIndex++;
    }
  }
  return { low: from, high: to, keys, whiteKeyWidth };
}
