import { buildTimeline, type InputSource } from "@open-keys/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerEngine } from "../engine/player-engine";
import { createPlayerStore } from "../stores/player.store";
import { createPlayerController } from "./player-controller";

class FakeAudio {
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  resume() {
    return Promise.resolve();
  }
}

/** A microphone that hears what the test plays. */
class FakeInput implements InputSource {
  expected: readonly number[] = [];
  accompaniment: readonly number[] = [];
  onNote: ((pitch: number, time: number) => void) | null = null;
  disposed = false;
  expect(pitches: readonly number[], accompaniment: readonly number[] = []) {
    this.expected = pitches;
    this.accompaniment = accompaniment;
  }
  play(...pitches: number[]) {
    for (const pitch of pitches) {
      this.onNote?.(pitch, performance.now() / 1000);
    }
  }
  dispose() {
    this.disposed = true;
    return Promise.resolve();
  }
}

/** Right hand: C4 E4 together at 1 s, G4 at 2 s. Left hand: C3 at 0.5 s and 1.5 s. */
function setup() {
  const audio = new FakeAudio();
  const note = (trackIndex: number, pitch: number, start: number) => ({
    trackIndex,
    pitch,
    ticks: Math.round(start * 480),
    start,
    end: start + 0.4,
    soundEnd: start + 0.4,
    velocity: 1,
  });
  const notes = [note(1, 48, 0.5), note(0, 60, 1), note(0, 64, 1), note(1, 48, 1.5), note(0, 67, 2)];
  const timeline = buildTimeline(
    { durationS: 4, notes, beats: [] },
    {
      mode: "tracks",
      splitPitch: 60,
      tracks: [
        { trackIndex: 0, hand: "right" },
        { trackIndex: 1, hand: "left" },
      ],
    },
  );
  const played: number[] = [];
  const engine = new PlayerEngine(
    timeline,
    audio,
    { play: (pitch) => played.push(pitch), stopAll: () => undefined },
    { click: () => undefined, stopAll: () => undefined },
  );
  const store = createPlayerStore({ durationMs: 4000 });
  const controller = createPlayerController(engine, store);
  store.setState({ status: "ready" });
  const input = new FakeInput();
  /** Audio clock and timers together, 25 ms at a time. */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.025) {
      audio.currentTime += 0.025;
      vi.advanceTimersByTime(25);
    }
  };
  return { engine, store, controller, input, played, run };
}

describe("wait mode (V1.5)", () => {
  afterEach(() => vi.useRealTimers());

  it("stops at each chord of the hand practised until it is heard, the app playing the other hand", async () => {
    vi.useFakeTimers();
    const { engine, store, controller, input, played, run } = setup();
    controller.setWaitHands("right");
    await controller.startWait(() => Promise.resolve(input));
    expect(store.getState().wait.status).toBe("on");
    expect(input.expected).toEqual([60, 64]);
    // The app plays the left hand around this chord: the microphone knows it.
    expect(input.accompaniment).toEqual([48]);

    await controller.play();
    run(2);
    expect(engine.isWaiting).toBe(true);
    expect(engine.position).toBe(1);
    expect(store.getState().waitingFor).toEqual([60, 64]);
    expect(store.getState().status).toBe("playing");

    input.play(60);
    run(0.1);
    expect(store.getState().waitingFor).toEqual([64]);
    input.play(64);
    run(0.1);
    expect(engine.isWaiting).toBe(false);
    expect(input.expected).toEqual([67]);

    run(1.5);
    expect(engine.position).toBe(2);
    expect(store.getState().waitingFor).toEqual([67]);
    // Only the left hand was played by the app: the right one is the player's.
    expect(played).toEqual([48, 48]);
  });

  it("counts notes struck just before the chord reaches the keyboard", async () => {
    vi.useFakeTimers();
    const { engine, controller, input, run } = setup();
    controller.setWaitHands("right");
    await controller.startWait(() => Promise.resolve(input));
    await controller.play();
    run(0.85);
    input.play(60, 64);
    run(0.5);
    expect(engine.isWaiting).toBe(false);
    expect(engine.position).toBeGreaterThan(1);
  });

  it("turns off: the input is closed, playback goes on and the hands sound again", async () => {
    vi.useFakeTimers();
    const { engine, store, controller, input, played, run } = setup();
    controller.setWaitHands("right");
    await controller.startWait(() => Promise.resolve(input));
    await controller.play();
    run(2);
    expect(engine.isWaiting).toBe(true);

    await controller.stopWait();
    expect(input.disposed).toBe(true);
    expect(store.getState().wait.status).toBe("off");
    expect(store.getState().waitingFor).toBeNull();
    run(1.5);
    expect(played).toContain(67);
  });

  it("says why the microphone could not open", async () => {
    const { store, controller } = setup();
    await controller.startWait(() => Promise.reject(new Error("Permission denied")));
    expect(store.getState().wait).toMatchObject({ status: "error", error: "Permission denied" });
  });
});
