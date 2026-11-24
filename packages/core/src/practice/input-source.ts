/**
 * Where the notes played come from (V1.5 microphone, V2 MIDI): the player never knows which one.
 * Times are seconds on the input's own monotonic clock (the page's `performance.now()` / 1000).
 */
export interface InputSource {
  /**
   * The notes the player waits for now. An input that listens (the microphone) only checks these,
   * which is far more reliable than transcribing everything; an input that knows (MIDI) ignores it.
   * `accompaniment`: notes the app plays meanwhile (the other hand), known sounds for the microphone.
   */
  expect(pitches: readonly number[], accompaniment?: readonly number[]): void;
  /** Called with each note played, and when it was heard. */
  onNote: ((pitch: number, time: number) => void) | null;
  dispose(): Promise<void>;
}
