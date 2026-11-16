import { FallingNotesRenderer } from "./falling-notes-renderer";
import { NoteScheduler } from "./note-scheduler";
import { PianoSampler } from "./piano-sampler";
import { parseSong, type Song } from "./song";
import { SongClock, type SyncMode } from "./song-clock";

const SALAMANDER_BASE_URL = "https://tonejs.github.io/audio/salamander/";
const LOOP_LENGTH_S = 8;
const SEEK_STEP_S = 5;
const HUD_REFRESH_MS = 250;
const JANK_THRESHOLD_MS = 25;

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing #${id}`);
  }
  return element;
}

function isSyncMode(value: string): value is SyncMode {
  return value === "output-timestamp" || value === "current-time" || value === "raw";
}

const ui = {
  stage: byId("stage", HTMLDivElement),
  hud: byId("hud", HTMLPreElement),
  controls: byId("controls", HTMLDivElement),
  songSelect: byId("song-select", HTMLSelectElement),
  fileInput: byId("file-input", HTMLInputElement),
  playButton: byId("play-btn", HTMLButtonElement),
  backButton: byId("back-btn", HTMLButtonElement),
  forwardButton: byId("fwd-btn", HTMLButtonElement),
  loopButton: byId("loop-btn", HTMLButtonElement),
  zoomButton: byId("zoom-btn", HTMLButtonElement),
  syncSelect: byId("sync-select", HTMLSelectElement),
  offsetInput: byId("offset-input", HTMLInputElement),
  offsetOutput: byId("offset-out", HTMLOutputElement),
  fullscreenButton: byId("fullscreen-btn", HTMLButtonElement),
  hideButton: byId("hide-btn", HTMLButtonElement),
  showButton: byId("show-btn", HTMLButtonElement),
  rateButtons: [...document.querySelectorAll<HTMLButtonElement>("button[data-rate]")],
};

const audioContext = new AudioContext({ latencyHint: "interactive" });
const sampler = new PianoSampler(audioContext);
const clock = new SongClock(audioContext);
const scheduler = new NoteScheduler(clock, sampler, audioContext);
const renderer = new FallingNotesRenderer(clock);

let song: Song | undefined;
let wakeLock: WakeLockSentinel | undefined;
let samplesReady = false;
let jankFrames = 0;
let worstFrameCostMs = 0;

function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute("aria-pressed", String(pressed));
}

function applySong(next: Song): void {
  pause();
  song = next;
  clock.seek(0);
  scheduler.loop = undefined;
  setPressed(ui.loopButton, false);
  scheduler.setSong(next);
  renderer.setSong(next);
}

async function loadFromUrl(url: string, title: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load ${url} (${response.status})`);
  }
  applySong(parseSong(await response.arrayBuffer(), title));
}

async function loadFromFile(file: File): Promise<void> {
  applySong(parseSong(await file.arrayBuffer(), file.name));
}

async function requestWakeLock(): Promise<void> {
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    wakeLock = undefined;
  }
}

async function play(): Promise<void> {
  if (!(song && samplesReady)) {
    return;
  }
  await audioContext.resume();
  scheduler.reset(clock.scheduledSongTime());
  clock.play();
  scheduler.start();
  ui.playButton.textContent = "⏸ Pause";
  await requestWakeLock();
}

function pause(): void {
  clock.pause();
  scheduler.stop();
  ui.playButton.textContent = "▶ Lecture";
  void wakeLock?.release();
  wakeLock = undefined;
}

function seekBy(deltaSeconds: number): void {
  const target = Math.max(0, clock.scheduledSongTime() + deltaSeconds);
  clock.seek(target);
  scheduler.reset(target);
}

function setRate(rate: number): void {
  clock.setRate(rate);
  scheduler.reset(clock.scheduledSongTime());
  for (const button of ui.rateButtons) {
    setPressed(button, Number(button.dataset["rate"]) === rate);
  }
}

function toggleLoop(): void {
  if (scheduler.loop) {
    scheduler.loop = undefined;
  } else {
    const start = clock.scheduledSongTime();
    scheduler.loop = { start, end: start + LOOP_LENGTH_S };
  }
  setPressed(ui.loopButton, scheduler.loop !== undefined);
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await document.documentElement.requestFullscreen();
  try {
    await screen.orientation.lock("landscape");
  } catch {
    // Not supported everywhere (desktop browsers): ignore.
  }
}

function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

function formatMs(seconds: number): string {
  return `${(seconds * 1000).toFixed(1)} ms`;
}

function hudText(): string {
  const ticker = renderer.app.ticker;
  const heard = clock.heardSongTime();
  const scheduled = clock.scheduledSongTime();
  return [
    `${song?.title ?? "—"} · ${song?.notes.length ?? 0} notes · mains: ${song?.handMode ?? "—"}`,
    `FPS ${ticker.FPS.toFixed(0)} · rendu ${renderer.stats.frameCostMs.toFixed(2)} ms (pire ${worstFrameCostMs.toFixed(2)} ms)`,
    `images > ${JANK_THRESHOLD_MS} ms : ${jankFrames} · notes à l'écran : ${renderer.stats.visibleNotes}`,
    `audio ${audioContext.state} · ${audioContext.sampleRate} Hz · samples ${samplesReady ? "ok" : "chargement…"}`,
    `baseLatency ${formatMs(audioContext.baseLatency)} · outputLatency ${formatMs(audioContext.outputLatency || 0)}`,
    `sync ${clock.syncMode} · décalage ${clock.offsetMs} ms · écart programmé/entendu ${formatMs(scheduled - heard)}`,
    `position ${formatSeconds(heard)} / ${formatSeconds(song?.duration ?? 0)} · vitesse ${clock.rate * 100} %`,
    `notes jouées ${scheduler.stats.scheduledNotes} · en retard ${scheduler.stats.skippedLateNotes} · voix ${sampler.activeVoices} · boucles ${scheduler.stats.loopCount}`,
  ].join("\n");
}

function bindControls(): void {
  ui.playButton.addEventListener("click", () => (clock.isPlaying ? pause() : void play()));
  ui.backButton.addEventListener("click", () => seekBy(-SEEK_STEP_S));
  ui.forwardButton.addEventListener("click", () => seekBy(SEEK_STEP_S));
  ui.loopButton.addEventListener("click", toggleLoop);
  ui.zoomButton.addEventListener("click", () => {
    const enabled = ui.zoomButton.getAttribute("aria-pressed") !== "true";
    setPressed(ui.zoomButton, enabled);
    renderer.setZoomToSong(enabled);
  });
  for (const button of ui.rateButtons) {
    button.addEventListener("click", () => setRate(Number(button.dataset["rate"])));
  }
  ui.songSelect.addEventListener("change", () => {
    const option = ui.songSelect.selectedOptions[0];
    void loadFromUrl(ui.songSelect.value, option?.textContent ?? ui.songSelect.value);
  });
  ui.fileInput.addEventListener("change", () => {
    const file = ui.fileInput.files?.[0];
    if (file) {
      void loadFromFile(file);
    }
  });
  ui.syncSelect.addEventListener("change", () => {
    if (isSyncMode(ui.syncSelect.value)) {
      clock.syncMode = ui.syncSelect.value;
    }
  });
  ui.offsetInput.addEventListener("input", () => {
    clock.offsetMs = Number(ui.offsetInput.value);
    ui.offsetOutput.textContent = `${clock.offsetMs} ms`;
  });
  ui.fullscreenButton.addEventListener("click", () => void toggleFullscreen());
  ui.hideButton.addEventListener("click", () => {
    ui.controls.hidden = true;
    ui.showButton.hidden = false;
  });
  ui.showButton.addEventListener("click", () => {
    ui.controls.hidden = false;
    ui.showButton.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      ui.playButton.click();
    }
  });
}

async function boot(): Promise<void> {
  await renderer.init(ui.stage);
  renderer.app.ticker.add((ticker) => {
    if (clock.isPlaying && ticker.deltaMS > JANK_THRESHOLD_MS) {
      jankFrames++;
    }
    worstFrameCostMs = Math.max(worstFrameCostMs, renderer.stats.frameCostMs);
  });
  setInterval(() => {
    ui.hud.textContent = hudText();
  }, HUD_REFRESH_MS);
  setInterval(() => {
    worstFrameCostMs = 0;
  }, 5000);
  scheduler.onEnd = pause;
  bindControls();
  const firstOption = ui.songSelect.selectedOptions[0];
  await loadFromUrl(ui.songSelect.value, firstOption?.textContent ?? "");
  await sampler.load(SALAMANDER_BASE_URL);
  samplesReady = true;
  // Test helper: ?autoplay starts immediately (needs a browser autoplay policy that allows audio).
  if (new URLSearchParams(location.search).has("autoplay")) {
    await play();
  }
}

void boot();
