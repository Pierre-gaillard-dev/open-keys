import type { ClickOutput } from "../engine/note-scheduler";

/** Short synthetic clicks (no sample to download): higher and louder on the first beat of a bar. */
const ACCENT_HZ = 1760;
const BEAT_HZ = 1175;
const ACCENT_GAIN = 0.55;
const BEAT_GAIN = 0.32;
const CLICK_S = 0.035;

/** Metronome and count-in clicks (UC-22, UC-24), on the same audio clock as the notes. */
export class Metronome implements ClickOutput {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  readonly #pending = new Set<OscillatorNode>();

  constructor(context: AudioContext) {
    this.#context = context;
    this.#output = context.createGain();
    this.#output.connect(context.destination);
  }

  click(time: number, accent: boolean): void {
    const oscillator = this.#context.createOscillator();
    const envelope = this.#context.createGain();
    oscillator.frequency.value = accent ? ACCENT_HZ : BEAT_HZ;
    envelope.gain.setValueAtTime(accent ? ACCENT_GAIN : BEAT_GAIN, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + CLICK_S);
    oscillator.connect(envelope).connect(this.#output);
    oscillator.start(time);
    oscillator.stop(time + CLICK_S);
    this.#pending.add(oscillator);
    oscillator.onended = () => {
      this.#pending.delete(oscillator);
      envelope.disconnect();
    };
  }

  stopAll(): void {
    for (const oscillator of this.#pending) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }
    this.#pending.clear();
  }
}
