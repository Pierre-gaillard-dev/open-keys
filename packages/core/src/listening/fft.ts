/**
 * Magnitude spectrum of a real signal: iterative radix-2 FFT, in place on preallocated buffers (no
 * allocation per frame). `size` is a power of two.
 */
export class Spectrum {
  readonly size: number;
  readonly #re: Float64Array;
  readonly #im: Float64Array;
  readonly #window: Float64Array;
  readonly #bitReversed: Uint32Array;
  /** cos and sin of -2πk/size, k < size / 2. */
  readonly #cos: Float64Array;
  readonly #sin: Float64Array;
  /** Magnitudes of bins 0 … size / 2. */
  readonly magnitudes: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.#re = new Float64Array(size);
    this.#im = new Float64Array(size);
    this.magnitudes = new Float64Array(size / 2 + 1);
    // Hann window: sharp peaks, low leakage between neighbouring semitones.
    this.#window = Float64Array.from(
      { length: size },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
    );
    this.#cos = Float64Array.from({ length: size / 2 }, (_, k) => Math.cos((-2 * Math.PI * k) / size));
    this.#sin = Float64Array.from({ length: size / 2 }, (_, k) => Math.sin((-2 * Math.PI * k) / size));
    const bits = Math.log2(size);
    this.#bitReversed = Uint32Array.from({ length: size }, (_, i) => {
      let reversed = 0;
      for (let bit = 0; bit < bits; bit++) {
        reversed = (reversed << 1) | ((i >> bit) & 1);
      }
      return reversed;
    });
  }

  /** Windows `samples` (the last `size` ones are used) and computes `magnitudes`. */
  compute(samples: ArrayLike<number>, offset = 0): Float64Array {
    const { size } = this;
    const re = this.#re;
    const im = this.#im;
    for (let i = 0; i < size; i++) {
      const j = this.#bitReversed[i] as number;
      re[j] = (samples[offset + i] ?? 0) * (this.#window[i] as number);
      im[j] = 0;
    }
    for (let half = 1; half < size; half *= 2) {
      const stride = size / (2 * half);
      for (let start = 0; start < size; start += 2 * half) {
        for (let k = 0; k < half; k++) {
          const cos = this.#cos[k * stride] as number;
          const sin = this.#sin[k * stride] as number;
          const a = start + k;
          const b = a + half;
          const tr = cos * (re[b] as number) - sin * (im[b] as number);
          const ti = sin * (re[b] as number) + cos * (im[b] as number);
          re[b] = (re[a] as number) - tr;
          im[b] = (im[a] as number) - ti;
          re[a] = (re[a] as number) + tr;
          im[a] = (im[a] as number) + ti;
        }
      }
    }
    for (let bin = 0; bin <= size / 2; bin++) {
      this.magnitudes[bin] = Math.hypot(re[bin] as number, im[bin] as number);
    }
    return this.magnitudes;
  }
}
