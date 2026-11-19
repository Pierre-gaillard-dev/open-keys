export const LOWEST_PITCH = 21;
export const HIGHEST_PITCH = 108;

export interface DetectorOptions {
  readonly sampleRate: number;
  /** 8192 at 48 kHz: 170 ms, enough to tell semitones apart down to the bass (with the harmonics). */
  readonly fftSize?: number;
  /** Harmonics summed per note. */
  readonly harmonics?: number;
  /** At most this many notes per frame (two hands). */
  readonly maxNotes?: number;
  /** A note must reach this share of the strongest one of the frame. */
  readonly relativeThreshold?: number;
  /** …and this many times the noise floor of the spectrum. */
  readonly noiseRatio?: number;
}

/** Verification of the expected notes (wait mode): margins of the three tests. */
export interface VerifyOptions {
  /** The note must beat its semitone neighbours by this factor. */
  readonly neighbourMargin?: number;
  /** Its odd harmonics (1, 3, 5) must carry this share of its salience: else, the octave above sounds. */
  readonly oddShare?: number;
  /** The octave below (when not expected) must stay under this share of its salience. */
  readonly lowerOctaveShare?: number;
  /**
   * The other expected notes are removed up to this many times the smooth envelope of their harmonics:
   * low, so that a note an octave above one of them keeps its own energy.
   */
  readonly envelopeFactor?: number;
  /** Measures of each check, for tuning (benchmark). */
  readonly onCheck?: (check: NoteCheck) => void;
}

export interface NoteCheck {
  readonly pitch: number;
  readonly salience: number;
  readonly floor: number;
  readonly neighbours: number;
  readonly odd: number;
  readonly lowerOdd: number;
  readonly present: boolean;
}

export interface DetectedNote {
  readonly pitch: number;
  /** Salience: weighted sum of its harmonics (arbitrary unit, compare within a frame). */
  readonly strength: number;
}

const frequencyOf = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);
/**
 * Search ± this share around harmonic h: a quarter of a semitone, plus the stretch of upper partials
 * (piano strings are slightly inharmonic).
 */
const toleranceOf = (h: number) => 0.012 + 0.002 * h;
/** A semitone is 5.9 % in frequency. */
const SEMITONE_RATIO = 2 ** (1 / 12) - 1;
/** A note this far below the best one is preferred when nearly as salient (its harmonics include the best's). */
const SUBHARMONIC_STEPS = [12, 19, 24] as const;
const SUBHARMONIC_SHARE = 0.75;

/**
 * Notes sounding in one magnitude spectrum (Klapuri's iterative estimation and cancellation): the
 * most salient note is taken, its harmonics are removed from the spectrum (no more than a smooth
 * envelope allows, so an octave played with it stays), and again, until nothing stands out. Salience
 * is the weighted sum of the harmonic peaks, so low notes with a weak fundamental are still found.
 */
export class PitchDetector {
  readonly fftSize: number;
  readonly sampleRate: number;
  readonly #harmonics: number;
  readonly #maxNotes: number;
  readonly #relativeThreshold: number;
  readonly #noiseRatio: number;
  readonly #work: Float64Array;
  readonly #sorted: Float64Array;
  /** For each pitch and harmonic: first and last bin to search, and the weight of the harmonic. */
  readonly #bands: { from: Int32Array; to: Int32Array; weight: Float64Array }[];
  readonly #peaks: Float64Array;

  constructor(options: DetectorOptions) {
    this.sampleRate = options.sampleRate;
    this.fftSize = options.fftSize ?? 8192;
    this.#harmonics = options.harmonics ?? 8;
    this.#maxNotes = options.maxNotes ?? 10;
    this.#relativeThreshold = options.relativeThreshold ?? 0.12;
    this.#noiseRatio = options.noiseRatio ?? 8;
    const bins = this.fftSize / 2 + 1;
    this.#work = new Float64Array(bins);
    this.#sorted = new Float64Array(bins);
    this.#peaks = new Float64Array(this.#harmonics + 2);
    const binOf = (frequency: number) => (frequency * this.fftSize) / this.sampleRate;
    this.#bands = [];
    for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
      const f0 = frequencyOf(pitch);
      const from = new Int32Array(this.#harmonics);
      const to = new Int32Array(this.#harmonics);
      const weight = new Float64Array(this.#harmonics);
      for (let h = 1; h <= this.#harmonics; h++) {
        const frequency = f0 * h;
        const tolerance = toleranceOf(h);
        const outside = frequency * (1 + tolerance) >= this.sampleRate / 2;
        const center = Math.round(binOf(frequency));
        from[h - 1] = outside
          ? 0
          : Math.max(1, Math.min(center, Math.round(binOf(frequency * (1 - tolerance)))));
        to[h - 1] = outside
          ? -1
          : Math.min(bins - 1, Math.max(center, Math.round(binOf(frequency * (1 + tolerance)))));
        // Below two bins per semitone, this harmonic cannot tell the note from its neighbours.
        const resolvable = Math.min(1, binOf(frequency * SEMITONE_RATIO) / 2);
        // Klapuri's weights: upper harmonics count less, and less for high notes.
        weight[h - 1] = resolvable * ((f0 + 27) / (h * f0 + 320));
      }
      this.#bands.push({ from, to, weight });
    }
  }

  /** Median magnitude: what the spectrum looks like where nothing is played. */
  #noiseFloor(magnitudes: Float64Array): number {
    this.#sorted.set(magnitudes);
    this.#sorted.sort();
    return this.#sorted[this.#sorted.length >> 1] ?? 0;
  }

  /** Peak magnitude of each harmonic of `pitch` in the working spectrum. */
  #harmonicPeaks(pitch: number): Float64Array {
    const band = this.#bands[pitch - LOWEST_PITCH];
    const peaks = this.#peaks;
    peaks.fill(0);
    if (!band) {
      return peaks;
    }
    for (let h = 0; h < this.#harmonics; h++) {
      let peak = 0;
      for (let bin = band.from[h] as number; bin <= (band.to[h] as number); bin++) {
        peak = Math.max(peak, this.#work[bin] as number);
      }
      peaks[h] = peak;
    }
    return peaks;
  }

  #salience(pitch: number): number {
    const band = this.#bands[pitch - LOWEST_PITCH];
    const peaks = this.#harmonicPeaks(pitch);
    let sum = 0;
    for (let h = 0; h < this.#harmonics; h++) {
      sum += (peaks[h] as number) * (band?.weight[h] ?? 0);
    }
    return sum;
  }

  /**
   * Removes the part of the spectrum explained by `pitch`: each harmonic peak is limited to the mean of
   * its neighbours (a piano's harmonics decrease smoothly), so a bigger peak, shared with another note,
   * keeps the rest.
   */
  #cancel(pitch: number, envelopeFactor = 1.5): void {
    const band = this.#bands[pitch - LOWEST_PITCH];
    if (!band) {
      return;
    }
    const peaks = Float64Array.from(this.#harmonicPeaks(pitch));
    for (let h = 0; h < this.#harmonics; h++) {
      const below = h > 0 ? (peaks[h - 1] as number) : (peaks[h] as number);
      const above = h + 1 < this.#harmonics ? (peaks[h + 1] as number) : (peaks[h] as number);
      const own = Math.min(peaks[h] as number, ((below + above) / 2) * envelopeFactor);
      for (let bin = band.from[h] as number; bin <= (band.to[h] as number); bin++) {
        this.#work[bin] = Math.max(0, (this.#work[bin] as number) - own);
      }
    }
  }

  /**
   * A played note also lights up the notes an octave (or an octave and a fifth) above, made of its own
   * harmonics: the lowest note that explains nearly as much, with a real fundamental, is the one played.
   */
  #lowestExplaining(pitch: number, salience: number): number {
    for (const steps of [...SUBHARMONIC_STEPS].reverse()) {
      const lower = pitch - steps;
      if (lower >= LOWEST_PITCH && this.#salience(lower) >= salience * SUBHARMONIC_SHARE) {
        return lower;
      }
    }
    return pitch;
  }

  /** Weighted salience of the odd harmonics only (1, 3, 5…). */
  #oddSalience(pitch: number): number {
    const band = this.#bands[pitch - LOWEST_PITCH];
    const peaks = this.#harmonicPeaks(pitch);
    let sum = 0;
    for (let h = 0; h < this.#harmonics; h += 2) {
      sum += (peaks[h] as number) * (band?.weight[h] ?? 0);
    }
    return sum;
  }

  /** The three tests of `verify` for one note, on the working spectrum. */
  #check(pitch: number, wanted: readonly number[], floor: number, options: VerifyOptions): NoteCheck {
    // A neighbour that is expected too (a cluster) is not a rival.
    const rival = (other: number) =>
      other >= LOWEST_PITCH && other <= HIGHEST_PITCH && !wanted.includes(other) ? this.#salience(other) : 0;
    const salience = this.#salience(pitch);
    const neighbours = Math.max(rival(pitch - 1), rival(pitch + 1));
    const lower = pitch - 12;
    const lowerOdd = lower >= LOWEST_PITCH && !wanted.includes(lower) ? this.#oddSalience(lower) : 0;
    const odd = this.#oddSalience(pitch);
    const present =
      salience > floor &&
      salience >= neighbours * (options.neighbourMargin ?? 1.3) &&
      odd >= salience * (options.oddShare ?? 0.36) &&
      lowerOdd <= salience * (options.lowerOctaveShare ?? 0.45);
    return { pitch, salience, floor, neighbours, odd, lowerOdd, present };
  }

  /**
   * Which of the `expected` notes sound in this frame (score-informed: the notes to play are known).
   * Each note is checked on the spectrum without the other expected notes (their harmonics removed),
   * so a chord does not lend its harmonics to the semitone neighbours of one of its notes. Tests: the
   * note beats its semitone neighbours, its odd harmonics are there (else the octave above sounds), and
   * no octave below explains it.
   */
  verify(magnitudes: Float64Array, expected: readonly number[], options: VerifyOptions = {}): number[] {
    const floor = this.#noiseFloor(magnitudes) * this.#noiseRatio;
    const wanted = [...new Set(expected)]
      .filter((pitch) => pitch >= LOWEST_PITCH && pitch <= HIGHEST_PITCH)
      .sort((a, b) => a - b);
    const heard: number[] = [];
    for (const pitch of wanted) {
      this.#work.set(magnitudes);
      for (const other of wanted) {
        if (other !== pitch) {
          this.#cancel(other, options.envelopeFactor ?? 1);
        }
      }
      const check = this.#check(pitch, wanted, floor, options);
      options.onCheck?.(check);
      if (check.present) {
        heard.push(pitch);
      }
    }
    return heard;
  }

  /** Notes of a frame, strongest first. */
  detect(magnitudes: Float64Array): DetectedNote[] {
    this.#work.set(magnitudes);
    const floor = this.#noiseFloor(magnitudes);
    const found: DetectedNote[] = [];
    let strongest = 0;
    while (found.length < this.#maxNotes) {
      let best = -1;
      let bestSalience = 0;
      for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch++) {
        // A note found already may keep some energy after cancellation: never listed twice.
        if (found.some((note) => note.pitch === pitch)) {
          continue;
        }
        const salience = this.#salience(pitch);
        if (salience > bestSalience) {
          bestSalience = salience;
          best = pitch;
        }
      }
      const lowest = this.#lowestExplaining(best, bestSalience);
      if (!found.some((note) => note.pitch === lowest)) {
        best = lowest;
        bestSalience = this.#salience(best);
      }
      strongest ||= bestSalience;
      const loudEnough =
        bestSalience > floor * this.#noiseRatio && bestSalience >= strongest * this.#relativeThreshold;
      if (best < 0 || !loudEnough) {
        break;
      }
      found.push({ pitch: best, strength: bestSalience });
      this.#cancel(best);
    }
    return found;
  }
}
