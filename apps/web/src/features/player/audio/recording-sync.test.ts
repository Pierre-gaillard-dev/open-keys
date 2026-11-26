import { describe, expect, it } from "vitest";
import { SongClock, START_DELAY_S } from "../engine/song-clock";
import { createRecordingSync, JUMP_THRESHOLD_S, type RecordingElement } from "./recording-sync";

class FakeAudioClock {
  currentTime = 0;
  baseLatency = 0;
  outputLatency = 0;
}

class FakeElement implements RecordingElement {
  currentTime = 0;
  playbackRate = 1;
  preservesPitch = false;
  paused = true;
  plays = 0;
  play() {
    this.paused = false;
    this.plays++;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

function setup() {
  const audio = new FakeAudioClock();
  const clock = new SongClock(audio);
  const element = new FakeElement();
  const sync = createRecordingSync(clock, element);
  return { audio, clock, element, sync };
}

describe("recording sync (D35)", () => {
  it("starts the recording where the song is, at the player's speed, keeping the pitch", () => {
    const { audio, clock, element, sync } = setup();
    clock.seek(12);
    clock.setRate(0.75);
    clock.play();
    audio.currentTime += START_DELAY_S + 1;

    sync.setEnabled(true);

    expect(element.paused).toBe(false);
    expect(element.currentTime).toBeCloseTo(12.75);
    expect(element.playbackRate).toBe(0.75);
    expect(element.preservesPitch).toBe(true);
    sync.dispose();
  });

  it("catches up a small drift by its speed, jumps after a seek", () => {
    const { audio, clock, element, sync } = setup();
    clock.play();
    audio.currentTime += START_DELAY_S + 2;
    sync.setEnabled(true);

    // The recording runs 50 ms ahead: a little slower.
    element.currentTime = 2.05;
    sync.sync();
    expect(element.playbackRate).toBeLessThan(1);
    expect(element.playbackRate).toBeGreaterThanOrEqual(0.97);

    // A seek: far away, the recording jumps.
    clock.seek(30);
    audio.currentTime += START_DELAY_S;
    sync.sync();
    expect(Math.abs(element.currentTime - 30)).toBeLessThan(JUMP_THRESHOLD_S);
    sync.dispose();
  });

  it("is silent while paused, during the count-in and when off", () => {
    const { audio, clock, element, sync } = setup();
    clock.play(2);
    audio.currentTime += 1;
    sync.setEnabled(true);
    // Counting in: the song time is still before 0.
    expect(element.paused).toBe(true);

    audio.currentTime += 2;
    sync.sync();
    expect(element.paused).toBe(false);

    clock.pause();
    sync.sync();
    expect(element.paused).toBe(true);

    clock.play();
    audio.currentTime += 1;
    sync.setEnabled(false);
    expect(element.paused).toBe(true);
    sync.dispose();
  });
});
