import type { Midi } from "./tonejs-midi";

/** One beat of the score, as the metronome clicks it. */
export interface Beat {
  /** Seconds at 100 % speed. */
  readonly time: number;
  /** First beat of a bar (accented). */
  readonly downbeat: boolean;
  /** Beats of the bar this beat belongs to (numerator of the time signature). */
  readonly beatsInBar: number;
}

interface Meter {
  readonly ticks: number;
  readonly beatsInBar: number;
  /** Denominator: 4 = quarter note beats, 8 = eighth note beats. */
  readonly beatUnit: number;
}

const DEFAULT_METER: Meter = { ticks: 0, beatsInBar: 4, beatUnit: 4 };
/** Guard against absurd files (a beat every tick for hours). */
const MAX_BEATS = 50_000;

function metersOf(midi: Midi): Meter[] {
  const meters = midi.header.timeSignatures
    .map((event) => ({
      ticks: event.ticks,
      beatsInBar: Math.max(1, Math.round(event.timeSignature[0] ?? 4)),
      beatUnit: Math.max(1, Math.round(event.timeSignature[1] ?? 4)),
    }))
    .sort((a, b) => a.ticks - b.ticks);
  return meters[0]?.ticks === 0 ? meters : [DEFAULT_METER, ...meters];
}

/**
 * Beats of the whole piece from its tempo map and time signatures (4/4 when the file has none). A file
 * recorded without a click (live performance) still has a grid, but it does not follow the music.
 */
export function beatGrid(midi: Midi): Beat[] {
  const ppq = midi.header.ppq;
  const meters = metersOf(midi);
  const lastTick = midi.durationTicks;
  const beats: Beat[] = [];
  meters.forEach((meter, index) => {
    const beatTicks = (ppq * 4) / meter.beatUnit;
    const end = meters[index + 1]?.ticks ?? lastTick + beatTicks;
    let beatInBar = 0;
    for (let tick = meter.ticks; tick < end && beats.length < MAX_BEATS; tick += beatTicks) {
      beats.push({
        time: midi.header.ticksToSeconds(tick),
        downbeat: beatInBar === 0,
        beatsInBar: meter.beatsInBar,
      });
      beatInBar = (beatInBar + 1) % meter.beatsInBar;
    }
  });
  return beats;
}
