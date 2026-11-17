import { buildTimeline } from "@open-keys/core";
import { describe, expect, it } from "vitest";
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
    { durationS: 10, notes },
    { mode: "tracks", splitPitch: 60, tracks: [{ trackIndex: 0, hand: "right" }] },
  );
  const engine = new PlayerEngine(timeline, audio, { play: () => undefined, stopAll: () => undefined });
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
      hands: { left: { audible: false, visible: true }, right: { audible: true, visible: true } },
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

    expect(store.getState().hands.left).toEqual({ audible: false, visible: false });
    expect(received.at(-1)?.visibleHands).toEqual({ left: false, right: true });
  });
});
