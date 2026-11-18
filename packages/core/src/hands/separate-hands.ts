import type { Hand } from "./hands.types";

/** What the separation needs from a note (seconds, MIDI pitch). */
export interface HandNote {
  readonly pitch: number;
  readonly start: number;
  /** Key release (not the end of the sound with the pedal): a held key keeps the hand in place. */
  readonly end: number;
}

/** Weights of the cost function, tuned on a benchmark (docs: lecteur, séparation des mains). */
export interface SeparationWeights {
  /** Notes starting within this window form one chord. */
  readonly chordWindowS: number;
  /** Hypotheses kept after each chord. */
  readonly beamWidth: number;
  /** Cost per semitone of hand movement. */
  readonly move: number;
  /** Extra cost of a movement made in a hurry: × (1 + hurry / time since the hand last played). */
  readonly hurry: number;
  /** Comfortable span of one hand, in semitones (an octave and a bit). */
  readonly comfortableSpan: number;
  /** Cost per semitone beyond the comfortable span. */
  readonly stretch: number;
  /** Cost per note beyond five in one hand (held keys included). */
  readonly extraFinger: number;
  /**
   * Share of the stretch and finger costs due to keys still held: a long note is often held by the
   * pedal (written as such in scores), not by the hand.
   */
  readonly held: number;
  /** Cost per semitone of the left hand above the right one. */
  readonly crossing: number;
  /** Cost per semitone of the left hand above `leftCeiling`, of the right one below `rightFloor`. */
  readonly register: number;
  readonly leftCeiling: number;
  readonly rightFloor: number;
}

export const DEFAULT_SEPARATION_WEIGHTS: SeparationWeights = {
  chordWindowS: 0.035,
  beamWidth: 12,
  move: 0.14,
  hurry: 0,
  comfortableSpan: 10,
  stretch: 2.4,
  extraFinger: 25,
  held: 0.75,
  crossing: 2,
  register: 0.21,
  leftCeiling: 62,
  rightFloor: 59,
};

interface HandState {
  /** Centre of the last notes played, in semitones. */
  readonly position: number;
  readonly lastStart: number;
  /** Keys still held down: pitch and release time. */
  readonly held: readonly { readonly pitch: number; readonly end: number }[];
}

interface Hypothesis {
  readonly cost: number;
  readonly left: HandState;
  readonly right: HandState;
  readonly parent: Hypothesis | null;
  /** Number of notes of the chord (sorted by pitch) given to the left hand. */
  readonly split: number;
}

interface Chord {
  readonly start: number;
  /** Indexes of the notes, sorted by pitch. */
  readonly notes: readonly number[];
}

function groupChords(notes: readonly HandNote[], windowS: number): Chord[] {
  const order = notes
    .map((_, index) => index)
    .sort((a, b) => (notes[a]?.start ?? 0) - (notes[b]?.start ?? 0));
  const chords: { start: number; notes: number[] }[] = [];
  for (const index of order) {
    const note = notes[index] as HandNote;
    const current = chords.at(-1);
    if (current && note.start - current.start <= windowS) {
      current.notes.push(index);
    } else {
      chords.push({ start: note.start, notes: [index] });
    }
  }
  for (const chord of chords) {
    chord.notes.sort((a, b) => (notes[a]?.pitch ?? 0) - (notes[b]?.pitch ?? 0));
  }
  return chords;
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Cost of one hand playing `pitches` at `start`, and its state afterwards. */
function playHand(
  hand: HandState,
  pitches: readonly number[],
  start: number,
  ends: readonly number[],
  w: SeparationWeights,
): { cost: number; state: HandState } {
  const held = hand.held.filter((key) => key.end > start + w.chordWindowS);
  if (pitches.length === 0) {
    return { cost: 0, state: held.length === hand.held.length ? hand : { ...hand, held } };
  }
  const all = [...held.map((key) => key.pitch), ...pitches];
  const stretch = (keys: readonly number[]) =>
    Math.max(0, Math.max(...keys) - Math.min(...keys) - w.comfortableSpan) * w.stretch +
    Math.max(0, keys.length - 5) * w.extraFinger;
  const played = stretch(pitches);
  const center = mean(pitches);
  const elapsed = Math.max(start - hand.lastStart, 0.05);
  let cost = Math.abs(center - hand.position) * w.move * (1 + w.hurry / elapsed);
  cost += played + (stretch(all) - played) * w.held;
  return {
    cost,
    state: {
      position: center,
      lastStart: start,
      held: [...held, ...pitches.map((pitch, index) => ({ pitch, end: ends[index] ?? start }))],
    },
  };
}

function extend(hypothesis: Hypothesis, chord: Chord, notes: readonly HandNote[], w: SeparationWeights) {
  const pitches = chord.notes.map((index) => (notes[index] as HandNote).pitch);
  const ends = chord.notes.map((index) => (notes[index] as HandNote).end);
  const next: Hypothesis[] = [];
  for (let split = 0; split <= pitches.length; split++) {
    const left = playHand(hypothesis.left, pitches.slice(0, split), chord.start, ends.slice(0, split), w);
    const right = playHand(hypothesis.right, pitches.slice(split), chord.start, ends.slice(split), w);
    const crossing = Math.max(0, left.state.position - right.state.position) * w.crossing;
    const register =
      (Math.max(0, left.state.position - w.leftCeiling) + Math.max(0, w.rightFloor - right.state.position)) *
      w.register;
    next.push({
      cost: hypothesis.cost + left.cost + right.cost + crossing + register,
      left: left.state,
      right: right.state,
      parent: hypothesis,
      split,
    });
  }
  return next;
}

/** Keeps the cheapest hypotheses, one per pair of hand positions (a variety of hand placements). */
function prune(hypotheses: Hypothesis[], width: number): Hypothesis[] {
  const best = new Map<string, Hypothesis>();
  for (const hypothesis of hypotheses) {
    const key = `${Math.round(hypothesis.left.position)}:${Math.round(hypothesis.right.position)}`;
    const kept = best.get(key);
    if (!kept || hypothesis.cost < kept.cost) {
      best.set(key, hypothesis);
    }
  }
  return [...best.values()].sort((a, b) => a.cost - b.cost).slice(0, width);
}

/**
 * Splits the notes of a piece between the two hands. Chord by chord, every split of the chord (lower
 * notes left, upper notes right) is weighed: hand movements (worse in a hurry), stretches beyond an
 * octave, more than five keys in a hand, hands crossing, each hand's usual register. A beam search
 * keeps the cheapest sequences over the whole piece, so a later passage can correct an earlier choice
 * (like the two-pass Kalman filter of Hadjakos et al.).
 */
export function separateHands(
  notes: readonly HandNote[],
  weights: SeparationWeights = DEFAULT_SEPARATION_WEIGHTS,
): Hand[] {
  const chords = groupChords(notes, weights.chordWindowS);
  let beam: Hypothesis[] = [
    {
      cost: 0,
      left: { position: 48, lastStart: Number.NEGATIVE_INFINITY, held: [] },
      right: { position: 72, lastStart: Number.NEGATIVE_INFINITY, held: [] },
      parent: null,
      split: 0,
    },
  ];
  for (const chord of chords) {
    beam = prune(
      beam.flatMap((hypothesis) => extend(hypothesis, chord, notes, weights)),
      weights.beamWidth,
    );
  }
  const hands: Hand[] = notes.map(() => "right");
  let hypothesis: Hypothesis | null | undefined = beam[0];
  for (let index = chords.length - 1; index >= 0 && hypothesis; index--) {
    const chord = chords[index] as Chord;
    chord.notes.forEach((note, position) => {
      hands[note] = position < (hypothesis as Hypothesis).split ? "left" : "right";
    });
    hypothesis = hypothesis.parent;
  }
  return hands;
}
