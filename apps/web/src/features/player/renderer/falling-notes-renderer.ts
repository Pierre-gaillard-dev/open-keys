import { firstNoteIndexAtOrAfter, type Hand, type PlayableNote, type Timeline } from "@open-keys/core";
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
// Shaders and uniforms without eval(): the CSP of the pages forbids 'unsafe-eval' (07-deploiement.md).
import "pixi.js/unsafe-eval";
import type { SongClock } from "../engine/song-clock";
import {
  computeKeyboardLayout,
  type KeyboardLayout,
  type KeyGeometry,
  visibleRange,
} from "./keyboard-layout";

/** Same tokens as global.css (PixiJS needs numbers). */
const COLORS = {
  background: 0x0b0e13,
  lane: 0x171d27,
  laneMiddleC: 0x26303f,
  hitLine: 0x3a4556,
  whiteKey: 0xe9edf2,
  middleC: 0xc9d6e8,
  blackKey: 0x141922,
  label: 0x5b6573,
  left: 0x4da3ff,
  right: 0xffb23f,
} as const;

/** Seconds a note takes to fall to the keyboard, whatever the playback speed (constant in real time). */
const VISIBLE_REAL_SECONDS = 2.5;
const MIDDLE_C = 60;
const BLACK_KEY_HEIGHT_RATIO = 0.62;

export interface RendererOptions {
  readonly visibleHands: Readonly<Record<Hand, boolean>>;
  readonly zoom: boolean;
}

/** Draws the falling notes and the keyboard. Reads the clock every frame: React never drives it. */
export class FallingNotesRenderer {
  readonly app = new Application();
  readonly #timeline: Timeline;
  readonly #clock: SongClock;
  readonly #lanes = new Graphics();
  readonly #notes = new Container();
  readonly #keyboard = new Container();
  readonly #notePool: Sprite[] = [];
  readonly #keyGlows = new Map<number, Sprite>();
  #layout: KeyboardLayout | undefined;
  #noteAreaHeight = 0;
  #options: RendererOptions;
  #initialized = false;

  constructor(timeline: Timeline, clock: SongClock, options: RendererOptions) {
    this.#timeline = timeline;
    this.#clock = clock;
    this.#options = options;
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: COLORS.background,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: "webgl",
    });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.#lanes, this.#notes, this.#keyboard);
    this.app.renderer.on("resize", () => this.#relayout());
    this.app.ticker.add(() => this.#renderFrame());
    this.#initialized = true;
    this.#relayout();
  }

  setOptions(options: RendererOptions): void {
    const zoomChanged = options.zoom !== this.#options.zoom;
    this.#options = options;
    if (zoomChanged && this.#initialized) {
      this.#relayout();
    }
  }

  destroy(): void {
    if (this.#initialized) {
      this.app.destroy({ removeView: true }, { children: true });
      this.#initialized = false;
    }
  }

  #relayout(): void {
    const { width, height } = this.app.screen;
    const keyboardHeight = Math.round(Math.min(170, Math.max(56, height * 0.2)));
    this.#noteAreaHeight = height - keyboardHeight;
    const [low, high] = visibleRange(this.#options.zoom, this.#timeline.minPitch, this.#timeline.maxPitch);
    this.#layout = computeKeyboardLayout(low, high, width);
    this.#drawLanes(this.#layout, width, height);
    this.#drawKeyboard(this.#layout, keyboardHeight);
  }

  #drawLanes(layout: KeyboardLayout, width: number, height: number): void {
    const lanes = this.#lanes.clear();
    for (const key of layout.keys.values()) {
      if (key.pitch % 12 === 0) {
        lanes
          .rect(key.x, 0, 1, this.#noteAreaHeight)
          .fill(key.pitch === MIDDLE_C ? COLORS.laneMiddleC : COLORS.lane);
      }
    }
    lanes.rect(0, this.#noteAreaHeight - 2, width, 2).fill(COLORS.hitLine);
    lanes.rect(0, this.#noteAreaHeight, width, height - this.#noteAreaHeight).fill(0x000000);
  }

  #drawKeyboard(layout: KeyboardLayout, keyboardHeight: number): void {
    const top = this.#noteAreaHeight;
    for (const child of this.#keyboard.removeChildren()) {
      child.destroy();
    }
    this.#keyGlows.clear();
    const whites = new Graphics();
    const whiteGlows = new Container();
    const blacks = new Graphics();
    const blackGlows = new Container();
    const labels = new Container();
    this.#keyboard.addChild(whites, whiteGlows, labels, blacks, blackGlows);

    for (const key of layout.keys.values()) {
      const keyHeight = key.isBlack ? keyboardHeight * BLACK_KEY_HEIGHT_RATIO : keyboardHeight;
      if (key.isBlack) {
        blacks.rect(key.x, top, key.width, keyHeight).fill(COLORS.blackKey);
      } else {
        whites
          .rect(key.x + 0.5, top, key.width - 1, keyHeight)
          .fill(key.pitch === MIDDLE_C ? COLORS.middleC : COLORS.whiteKey);
      }
      if (key.pitch % 12 === 0 && key.width >= 14) {
        labels.addChild(this.#octaveLabel(key, top + keyHeight));
      }
      const glow = new Sprite(Texture.WHITE);
      glow.position.set(key.x + 1, top);
      glow.width = key.width - 2;
      glow.height = keyHeight - 1;
      glow.visible = false;
      (key.isBlack ? blackGlows : whiteGlows).addChild(glow);
      this.#keyGlows.set(key.pitch, glow);
    }
  }

  /** "C4" under every C, so the screen maps to the real keyboard. */
  #octaveLabel(key: KeyGeometry, bottom: number): Text {
    const label = new Text({
      text: `C${Math.floor(key.pitch / 12) - 1}`,
      style: {
        fontFamily: "Inter Variable, system-ui, sans-serif",
        fontSize: Math.min(12, key.width * 0.45),
        fontWeight: key.pitch === MIDDLE_C ? "700" : "500",
        fill: key.pitch === MIDDLE_C ? COLORS.blackKey : COLORS.label,
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(key.x + key.width / 2, bottom - 6);
    return label;
  }

  #renderFrame(): void {
    const layout = this.#layout;
    if (!layout) {
      return;
    }
    for (const glow of this.#keyGlows.values()) {
      glow.visible = false;
    }
    const now = this.#clock.heardSongTime();
    const pixelsPerSongSecond = this.#noteAreaHeight / VISIBLE_REAL_SECONDS / this.#clock.rate;
    const horizon = now + this.#noteAreaHeight / pixelsPerSongSecond;
    const notes = this.#timeline.notes;
    let used = 0;
    for (
      let i = firstNoteIndexAtOrAfter(notes, now - this.#timeline.maxNoteDuration);
      i < notes.length;
      i++
    ) {
      const note = notes[i];
      if (note === undefined || note.start > horizon) {
        break;
      }
      const key =
        note.end > now && this.#options.visibleHands[note.hand] ? layout.keys.get(note.pitch) : undefined;
      if (key && this.#drawNote(note, key, now, pixelsPerSongSecond, used)) {
        used++;
      }
    }
    for (let i = used; i < this.#notePool.length; i++) {
      const sprite = this.#notePool[i];
      if (sprite) {
        sprite.visible = false;
      }
    }
  }

  /** Returns true when a sprite was used. */
  #drawNote(
    note: PlayableNote,
    key: KeyGeometry,
    now: number,
    pixelsPerSongSecond: number,
    index: number,
  ): boolean {
    const color = note.hand === "left" ? COLORS.left : COLORS.right;
    const sounding = note.start <= now;
    if (sounding) {
      const glow = this.#keyGlows.get(note.pitch);
      if (glow) {
        glow.visible = true;
        glow.tint = color;
      }
    }
    const area = this.#noteAreaHeight;
    const bottom = Math.min(area, area - (note.start - now) * pixelsPerSongSecond);
    const top = Math.max(0, area - (note.end - now) * pixelsPerSongSecond);
    if (bottom - top < 1) {
      return false;
    }
    const sprite = this.#noteSprite(index);
    sprite.position.set(key.x + 1, top);
    sprite.width = Math.max(1, key.width - 2);
    sprite.height = Math.max(1, bottom - top - 1);
    sprite.tint = color;
    sprite.alpha = sounding ? 1 : 0.88;
    return true;
  }

  #noteSprite(index: number): Sprite {
    let sprite = this.#notePool[index];
    if (!sprite) {
      sprite = new Sprite(Texture.WHITE);
      this.#notePool.push(sprite);
      this.#notes.addChild(sprite);
    }
    sprite.visible = true;
    return sprite;
  }
}
