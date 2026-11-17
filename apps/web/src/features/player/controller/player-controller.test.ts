import { buildTimeline } from "@open-keys/core";
import { describe, expect, it, vi } from "vitest";
import { PlayerEngine } from "../engine/player-engine";
import { START_DELAY_S } from "../engine/song-clock";
import type { RendererOptions } from "../renderer/falling-notes-renderer";
import { createPlayerStore } from "../stores/player.store";
import { createPlayerController, type PlaybackListener } from "./player-controller";

class FakeAudio {
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
  resume() {
    return Promise.resolve();
  }
}

function setup(initial: Parameters<typeof createPlayerStore>[0] = { durationMs: 10_000 }) {
  const audio = new FakeAudio();
  const notes = Array.from({ length: 10 }, (_, i) => ({
    trackIndex: 0,
    pitch: 60,
    start: i,
    end: i + 0.5,
    soundEnd: i + 0.5,
    velocity: 1,
  }));
  const timeline = buildTimeline(
    {
      durationS: 10,
      notes,
      beats: Array.from({ length: 22 }, (_, i) => ({ time: i * 0.5, downbeat: i % 4 === 0, beatsInBar: 4 })),
    },
    { mode: "tracks", splitPitch: 60, tracks: [{ trackIndex: 0, hand: "right" }] },
  );
  const engine = new PlayerEngine(
    timeline,
    audio,
    { play: () => undefined, stopAll: () => undefined },
    { click: () => undefined, stopAll: () => undefined },
  );
  const store = createPlayerStore(initial);
  const events: string[] = [];
  const listener: PlaybackListener = {
    playing: (tempo) => events.push(`play@${tempo}`),
    paused: () => events.push("pause"),
    tempo: (tempo) => events.push(`tempo@${tempo}`),
  };
  const controller = createPlayerController(engine, store, listener);
  store.setState({ status: "ready" });
  const advance = (seconds: number) => {
    audio.currentTime += seconds;
  };
  return { audio, engine, store, controller, events, advance };
}

describe("player controller", () => {
  it("restores the saved position, speed and hands", () => {
    const { engine, store } = setup({
      durationMs: 10_000,
      positionMs: 4000,
      tempoPct: 75,
      hands: {
        left: { audible: false, visible: true, volume: 1 },
        right: { audible: true, visible: true, volume: 1 },
      },
    });

    expect(engine.position).toBe(4);
    expect(engine.clock.rate).toBe(0.75);
    expect(store.getState().positionMs).toBe(4000);
  });

  it("plays and pauses, notifying the session tracker", async () => {
    const { controller, store, events, advance } = setup();

    await controller.play();
    advance(START_DELAY_S + 2);
    controller.pause();

    expect(store.getState()).toMatchObject({ status: "ready", positionMs: 2000 });
    expect(events).toEqual(["play@100", "pause"]);
  });

  it("clamps the speed between 25 and 100 %", () => {
    const { controller, store } = setup();

    controller.changeTempo(-5);
    expect(store.getState().tempoPct).toBe(95);
    controller.setTempo(10);
    expect(store.getState().tempoPct).toBe(25);
    controller.setTempo(140);
    expect(store.getState().tempoPct).toBe(100);
  });

  it("builds a loop from A and B and can disable it", () => {
    const { controller, store, engine } = setup();

    controller.seekTo(2000);
    controller.markLoopStart();
    controller.seekTo(5000);
    controller.markLoopEnd();

    expect(store.getState()).toMatchObject({
      loop: { startMs: 2000, endMs: 5000, id: null },
      loopEnabled: true,
      pendingLoopStartMs: null,
    });
    expect(engine.position).toBe(2);
    controller.toggleLoop();
    expect(store.getState().loopEnabled).toBe(false);
  });

  it("ignores a loop shorter than half a second", () => {
    const { controller, store } = setup();

    controller.seekTo(2000);
    controller.markLoopStart();
    controller.seekTo(2200);
    controller.markLoopEnd();

    expect(store.getState().loop).toBeNull();
  });

  it("hides a hand in the renderer and mutes it independently", () => {
    const { controller, store } = setup();
    const received: RendererOptions[] = [];
    controller.attachRenderer({ setOptions: (options) => received.push(options) });

    controller.toggleHand("left", "visible");
    controller.toggleHand("left", "audible");

    expect(store.getState().hands.left).toEqual({ audible: false, visible: false, volume: 1 });
    expect(received.at(-1)?.visibleHands).toEqual({ left: false, right: true });
  });

  it("sets the volume of a hand, kept with the other hand settings (UC-25)", () => {
    const { store, controller } = setup();

    controller.setHandVolume("left", 37);
    controller.setHandVolume("right", 150);

    expect(store.getState().hands.left.volume).toBe(0.37);
    expect(store.getState().hands.right.volume).toBe(1);
  });

  it("switches count-in, metronome and note names, and tells the renderer (UC-22 to UC-24)", () => {
    const { store, controller } = setup();
    const received: RendererOptions[] = [];
    controller.attachRenderer({ setOptions: (options) => received.push(options) });

    controller.toggleCountIn();
    controller.toggleMetronome();
    controller.cycleNoteNames();
    controller.cycleNoteNames();

    expect(store.getState().preferences).toEqual({ countIn: true, metronome: true, noteNames: "keys" });
    expect(received.at(-1)?.noteNames).toBe("keys");
  });

  it("shows the count-in beat by beat, then hides it when the music starts", async () => {
    vi.useFakeTimers();
    try {
      const { store, controller } = setup({
        durationMs: 10_000,
        preferences: { countIn: true, metronome: false, noteNames: "off" },
      });

      await controller.play();
      expect(store.getState().countInBeatsLeft).toBeNull();
      vi.advanceTimersByTime(START_DELAY_S * 1000 + 1);
      expect(store.getState().countInBeatsLeft).toBe(4);
      vi.advanceTimersByTime(1000);
      expect(store.getState().countInBeatsLeft).toBe(2);
      vi.advanceTimersByTime(1000);
      expect(store.getState().countInBeatsLeft).toBeNull();

      await controller.play();
      controller.pause();
      expect(store.getState().countInBeatsLeft).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("loop progression (UC-26)", () => {
    function looping(loop: { targetTempoPct?: number | null; bestTempoPct?: number | null } = {}) {
      const context = setup({ durationMs: 10_000, tempoPct: 70 });
      context.controller.selectLoop({
        startMs: 1000,
        endMs: 3000,
        id: "01JD0000000000000000000L01",
        name: "Pont",
        targetTempoPct: loop.targetTempoPct ?? null,
        bestTempoPct: loop.bestTempoPct ?? null,
      });
      const turns = (count: number) => {
        for (let turn = 0; turn < count; turn++) {
          context.engine.onLoopRestart();
        }
      };
      return { ...context, turns };
    }

    it("keeps the speed as the best one after 3 turns in a row", () => {
      const { store, turns } = looping({ bestTempoPct: 60 });

      turns(2);
      expect(store.getState().loop?.bestTempoPct).toBe(60);
      turns(1);
      expect(store.getState().loop?.bestTempoPct).toBe(70);
    });

    it("proposes +5 % after 5 turns, up to the target, then starts counting again at the new speed", () => {
      const { store, controller, turns } = looping({ targetTempoPct: 72 });

      turns(4);
      expect(store.getState().speedUpOffer).toBeNull();
      turns(1);
      expect(store.getState().speedUpOffer).toBe(72);

      controller.acceptSpeedUp();
      expect(store.getState()).toMatchObject({ tempoPct: 72, loopRuns: 0, speedUpOffer: null });
      turns(5);
      // Target reached: nothing more to propose.
      expect(store.getState().speedUpOffer).toBeNull();
    });

    it("waits as many turns again after 'later', and restarts the count when the speed changes", () => {
      const { store, controller, turns } = looping();

      turns(5);
      controller.dismissSpeedUp();
      expect(store.getState()).toMatchObject({ loopRuns: 0, speedUpOffer: null });
      turns(3);
      controller.changeTempo(-5);
      expect(store.getState().loopRuns).toBe(0);
    });

    it("sets the target speed of the current loop", () => {
      const { store, controller } = looping();

      controller.setLoopTarget(85);

      expect(store.getState().loop?.targetTempoPct).toBe(85);
    });
  });
});
