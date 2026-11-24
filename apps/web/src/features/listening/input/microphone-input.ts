import type { InputSource } from "@open-keys/core";
import { openMicrophone } from "../audio/microphone";
import { createDspEngine } from "../engines/dsp-engine";
import type { Sensitivity } from "../engines/listening-engine";
import { REQUIRED_FRAMES } from "../lab/lab-attempt";

/**
 * The microphone as an input of the player (V1.5): the in-house detector checks the notes expected,
 * and a note is played when heard REQUIRED_FRAMES frames in a row, after a strike (D30, D31). Opening
 * it asks for the microphone: call it from a user gesture.
 */
export async function createMicrophoneInput(sensitivity: Sensitivity = "medium"): Promise<InputSource> {
  const streaks = new Map<number, number>();
  let rate = 0;
  let engine: ReturnType<typeof createDspEngine> | null = null;
  const input: InputSource = {
    expect(pitches, accompaniment) {
      engine?.expect(pitches, accompaniment);
    },
    onNote: null,
    async dispose() {
      engine?.dispose();
      engine = null;
      await microphone.stop();
    },
  };
  const microphone = await openMicrophone((samples) => {
    if (rate !== 0) {
      engine?.push(samples);
    }
  });
  rate = microphone.sampleRate;
  engine = createDspEngine({
    sampleRate: rate,
    sensitivity,
    onFrame(frame) {
      for (const [pitch, streak] of streaks) {
        if (!frame.heard.includes(pitch) && streak > 0) {
          streaks.set(pitch, 0);
        }
      }
      for (const pitch of frame.heard) {
        const streak = (streaks.get(pitch) ?? 0) + 1;
        streaks.set(pitch, streak);
        if (streak === REQUIRED_FRAMES) {
          input.onNote?.(pitch, performance.now() / 1000);
        }
      }
    },
  });
  return input;
}
