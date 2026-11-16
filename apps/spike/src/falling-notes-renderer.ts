import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
  computeKeyboardLayout,
  type KeyboardLayout,
  type KeyGeometry,
  PIANO_HIGHEST,
  PIANO_LOWEST,
} from "./keyboard-layout";
import { firstNoteAtOrAfter, type Song, type SongNote } from "./song";
import type { SongClock } from "./song-clock";

const COLORS = {
  background: 0x0b0e13,
  lane: 0x171d27,
  laneMiddleC: 0x26303f,
  hitLine: 0x3a4556,
  whiteKey: 0xe9edf2,
  middleC: 0xc9d6e8,
  blackKey: 0x141922,
  left: 0x4da3ff,
  right: 0xffb23f,
} as const;

/** Time (real seconds) a note takes to fall from the top to the keyboard. Constant whatever the speed. */
const VISIBLE_REAL_SECONDS = 2.5;
const MIDDLE_C = 60;
const BLACK_KEY_HEIGHT_RATIO = 0.62;

export interface RenderStats {
  visibleNotes: number;
  frameCostMs: number;
}

export class FallingNotesRenderer {
  readonly app = new Application();
  readonly stats: RenderStats = { visibleNotes: 0, frameCostMs: 0 };
  readonly #clock: SongClock;
  readonly #lanes = new Graphics();
  readonly #notes = new Container();
  readonly #whiteKeys = new Graphics();
  readonly #whiteGlows = new Container();
  readonly #blackKeys = new Graphics();
  readonly #blackGlows = new Container();
  readonly #notePool: Sprite[] = [];
  readonly #keyGlows = new Map<number, Sprite>();
  #song: Song | undefined;
  #layout: KeyboardLayout | undefined;
  #zoomToSong = false;
  #noteAreaHeight = 0;

  constructor(clock: SongClock) {
    this.#clock = clock;
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
    this.app.stage.addChild(
      this.#lanes,
      this.#notes,
      this.#whiteKeys,
      this.#whiteGlows,
      this.#blackKeys,
      this.#blackGlows,
    );
    this.app.renderer.on("resize", () => this.#relayout());
    this.app.ticker.add(() => this.#renderFrame());
    this.#relayout();
  }

  setSong(song: Song): void {
    this.#song = song;
    this.#relayout();
  }

  setZoomToSong(enabled: boolean): void {
    this.#zoomToSong = enabled;
    this.#relayout();
  }

  #relayout(): void {
    const { width, height } = this.app.screen;
    const keyboardHeight = Math.round(Math.min(170, Math.max(56, height * 0.2)));
    this.#noteAreaHeight = height - keyboardHeight;
    const song = this.#song;
    const [low, high] =
      this.#zoomToSong && song ? [song.minPitch - 2, song.maxPitch + 2] : [PIANO_LOWEST, PIANO_HIGHEST];
    const layout = computeKeyboardLayout(low, high, width);
    this.#layout = layout;
    this.#drawLanes(layout, height);
    this.#drawKeyboard(layout, keyboardHeight);
  }

  #drawLanes(layout: KeyboardLayout, height: number): void {
    const lanes = this.#lanes.clear();
    for (const key of layout.keys.values()) {
      if (key.pitch % 12 === 0) {
        lanes
          .rect(key.x, 0, 1, this.#noteAreaHeight)
          .fill(key.pitch === MIDDLE_C ? COLORS.laneMiddleC : COLORS.lane);
      }
    }
    lanes.rect(0, this.#noteAreaHeight - 2, this.app.screen.width, 2).fill(COLORS.hitLine);
    lanes.rect(0, this.#noteAreaHeight, this.app.screen.width, height - this.#noteAreaHeight).fill(0x000000);
  }

  #drawKeyboard(layout: KeyboardLayout, keyboardHeight: number): void {
    const top = this.#noteAreaHeight;
    const whites = this.#whiteKeys.clear();
    const blacks = this.#blackKeys.clear();
    this.#whiteGlows.removeChildren();
    this.#blackGlows.removeChildren();
    this.#keyGlows.clear();
    for (const key of layout.keys.values()) {
      const keyHeight = key.isBlack ? keyboardHeight * BLACK_KEY_HEIGHT_RATIO : keyboardHeight;
      if (key.isBlack) {
        blacks.rect(key.x, top, key.width, keyHeight).fill(COLORS.blackKey);
      } else {
        whites
          .rect(key.x + 0.5, top, key.width - 1, keyHeight)
          .fill(key.pitch === MIDDLE_C ? COLORS.middleC : COLORS.whiteKey);
      }
      const glow = new Sprite(Texture.WHITE);
      glow.position.set(key.x + 1, top);
      glow.width = key.width - 2;
      glow.height = keyHeight - 1;
      glow.visible = false;
      (key.isBlack ? this.#blackGlows : this.#whiteGlows).addChild(glow);
      this.#keyGlows.set(key.pitch, glow);
    }
  }

  #renderFrame(): void {
    const startedAt = performance.now();
    const song = this.#song;
    const layout = this.#layout;
    if (!(song && layout)) {
      return;
    }
    for (const glow of this.#keyGlows.values()) {
      glow.visible = false;
    }
    const now = this.#clock.heardSongTime();
    const pixelsPerSongSecond = this.#noteAreaHeight / VISIBLE_REAL_SECONDS / this.#clock.rate;
    const horizonEnd = now + this.#noteAreaHeight / pixelsPerSongSecond;

    let used = 0;
    const notes = song.notes;
    for (let i = firstNoteAtOrAfter(notes, now - song.maxNoteDuration); i < notes.length; i++) {
      const note = notes[i];
      if (note === undefined || note.start > horizonEnd) {
        break;
      }
      const key = note.end > now ? layout.keys.get(note.pitch) : undefined;
      if (key !== undefined && this.#drawNote(note, key, now, pixelsPerSongSecond, used)) {
        used++;
      }
    }
    for (let i = used; i < this.#notePool.length; i++) {
      const sprite = this.#notePool[i];
      if (sprite) {
        sprite.visible = false;
      }
    }
    this.stats.visibleNotes = used;
    this.stats.frameCostMs = performance.now() - startedAt;
  }

  /** Returns true when a sprite was used. */
  #drawNote(
    note: SongNote,
    key: KeyGeometry,
    now: number,
    pixelsPerSongSecond: number,
    index: number,
  ): boolean {
    const color = note.hand === "left" ? COLORS.left : COLORS.right;
    const isSounding = note.start <= now;
    if (isSounding) {
      const glow = this.#keyGlows.get(note.pitch);
      if (glow) {
        glow.visible = true;
        glow.tint = color;
      }
    }
    const areaHeight = this.#noteAreaHeight;
    const bottom = Math.min(areaHeight, areaHeight - (note.start - now) * pixelsPerSongSecond);
    const top = Math.max(0, areaHeight - (note.end - now) * pixelsPerSongSecond);
    if (bottom - top < 1) {
      return false;
    }
    const sprite = this.#noteSprite(index);
    sprite.position.set(key.x + 1, top);
    sprite.width = Math.max(1, key.width - 2);
    sprite.height = Math.max(1, bottom - top - 1);
    sprite.tint = color;
    sprite.alpha = isSounding ? 1 : 0.88;
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
