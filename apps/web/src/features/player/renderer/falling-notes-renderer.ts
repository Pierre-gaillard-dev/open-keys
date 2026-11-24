import {
  firstNoteIndexAtOrAfter,
  type Hand,
  midiToNoteName,
  type NoteNaming,
  type PlayableNote,
  pitchClassName,
  type Timeline,
} from "@open-keys/core";
import { Application, Container, Graphics, NineSliceSprite, Sprite, Text, Texture } from "pixi.js";
// Shaders and uniforms without eval(): the CSP of the pages forbids 'unsafe-eval' (07-deploiement.md).
import "pixi.js/unsafe-eval";
import type { SongClock } from "../engine/song-clock";
import type { NoteNamesMode } from "../stores/player-preferences";
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
  /** Played on the piano, missed (rhythm mode): the theme's success and danger colors. */
  played: 0x5bd69a,
  missed: 0xff7a7a,
} as const;

/** Values of the note marks (see `setNoteMarks`): same as the piano mode's. */
const MARK_PLAYED = 1;
const MARK_MISSED = 2;

/** Seconds a note takes to fall to the keyboard, whatever the playback speed (constant in real time). */
const VISIBLE_REAL_SECONDS = 2.5;
const MIDDLE_C = 60;
const BLACK_KEY_HEIGHT_RATIO = 0.62;
const FONT_FAMILY = "Inter Variable, system-ui, sans-serif";
/** Note names are only written where they fit (narrow keys when the whole keyboard is shown). */
const MIN_NAMED_KEY_WIDTH = 11;
/** Rounded corners and a gap between notes: the same note played twice in a row reads as two notes. */
const NOTE_RADIUS_PX = 4;
const NOTE_GAP_PX = 3;

/** Below this size a name is not written: it could not be read. */
const MIN_FONT_SIZE = 6;

/**
 * Font size for `text` to fit `width`: at most `max` and `share` of the width, and smaller for longer
 * names ("Sol#" is twice "G#"; a character is about 0.55 em wide).
 */
const fittedFontSize = (text: string, width: number, max: number, share: number) =>
  Math.min(max, width * share, (1.8 * width) / Math.max(1, text.length));
const NOTE_NAME_COLOR = 0x0b0e13;

const namesOnKeys = (mode: NoteNamesMode) => mode === "keys" || mode === "both";

/** Pooled display objects not used this frame. */
function hideFrom(pool: readonly { visible: boolean }[], used: number): void {
  for (let i = used; i < pool.length; i++) {
    const item = pool[i];
    if (item) {
      item.visible = false;
    }
  }
}
const namesOnNotes = (mode: NoteNamesMode) => mode === "notes" || mode === "both";

export interface RendererOptions {
  readonly visibleHands: Readonly<Record<Hand, boolean>>;
  readonly zoom: boolean;
  /** Note names on the falling notes and/or the keys (UC-23). */
  readonly noteNames: NoteNamesMode;
  /** C D E or Do Ré Mi (setting of the account). */
  readonly noteNaming: NoteNaming;
}

/** Draws the falling notes and the keyboard. Reads the clock every frame: React never drives it. */
export class FallingNotesRenderer {
  readonly app = new Application();
  readonly #timeline: Timeline;
  readonly #clock: SongClock;
  readonly #lanes = new Graphics();
  readonly #notes = new Container();
  readonly #keyboard = new Container();
  readonly #notePool: NineSliceSprite[] = [];
  /** Rounded rectangle, stretched by nine-slice so the corners keep their radius at any size. */
  #noteTexture: Texture = Texture.WHITE;
  readonly #noteNames = new Container();
  readonly #namePool: Text[] = [];
  readonly #keyGlows = new Map<number, Sprite>();
  /** Same glows as a list: hidden every frame without allocating. */
  #glowList: Sprite[] = [];
  #layout: KeyboardLayout | undefined;
  #noteAreaHeight = 0;
  #options: RendererOptions;
  /** One byte per note: played or missed on the piano (V1.5). Read every frame, written elsewhere. */
  #marks: Uint8Array | null = null;
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
    this.#noteTexture = this.app.renderer.generateTexture(
      new Graphics().roundRect(0, 0, NOTE_RADIUS_PX * 4, NOTE_RADIUS_PX * 4, NOTE_RADIUS_PX).fill(0xffffff),
    );
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.#lanes, this.#notes, this.#noteNames, this.#keyboard);
    this.app.renderer.on("resize", () => this.#relayout());
    this.app.ticker.add(() => this.#renderFrame());
    this.#initialized = true;
    this.#relayout();
  }

  setNoteMarks(marks: Uint8Array): void {
    this.#marks = marks;
  }

  setOptions(options: RendererOptions): void {
    const layoutChanged =
      options.zoom !== this.#options.zoom ||
      options.noteNames !== this.#options.noteNames ||
      options.noteNaming !== this.#options.noteNaming;
    this.#options = options;
    if (layoutChanged && this.#initialized) {
      this.#relayout();
    }
  }

  destroy(): void {
    if (this.#initialized) {
      this.app.destroy({ removeView: true }, { children: true });
      this.#noteTexture.destroy(true);
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
    this.#glowList = [];
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
      const label = this.#keyLabel(key, top + keyHeight);
      if (label) {
        // Above the black keys for their names, between white and black keys otherwise.
        (key.isBlack ? blackGlows : labels).addChild(label);
      }
      const glow = new Sprite(Texture.WHITE);
      glow.position.set(key.x + 1, top);
      glow.width = key.width - 2;
      glow.height = keyHeight - 1;
      glow.visible = false;
      (key.isBlack ? blackGlows : whiteGlows).addChild(glow);
      this.#keyGlows.set(key.pitch, glow);
      this.#glowList.push(glow);
    }
  }

  /** Octave label of the Cs, letter of the other keys when names are shown on keys (UC-23). */
  #keyLabel(key: KeyGeometry, bottom: number): Text | null {
    if (key.pitch % 12 === 0 && key.width >= 14) {
      return this.#octaveLabel(key, bottom);
    }
    if (namesOnKeys(this.#options.noteNames) && key.width >= MIN_NAMED_KEY_WIDTH) {
      // Null when the name does not fit the key.
      return this.#keyName(key, bottom);
    }
    return null;
  }

  /** "C4" (or "Do3") under every C, so the screen maps to the real keyboard. */
  #octaveLabel(key: KeyGeometry, bottom: number): Text {
    const text = midiToNoteName(key.pitch, this.#options.noteNaming);
    const label = new Text({
      text,
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: fittedFontSize(text, key.width, 12, 0.45),
        fontWeight: key.pitch === MIDDLE_C ? "700" : "500",
        fill: key.pitch === MIDDLE_C ? COLORS.blackKey : COLORS.label,
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(key.x + key.width / 2, bottom - 6);
    return label;
  }

  /** Letter of a key (UC-23); the Cs keep their octave label. */
  #keyName(key: KeyGeometry, bottom: number): Text | null {
    const text = pitchClassName(key.pitch, this.#options.noteNaming);
    const fontSize = fittedFontSize(text, key.width, 12, key.isBlack ? 0.5 : 0.45);
    if (fontSize < MIN_FONT_SIZE) {
      return null;
    }
    const label = new Text({
      text,
      style: {
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight: "600",
        fill: key.isBlack ? COLORS.whiteKey : COLORS.label,
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(key.x + key.width / 2, bottom - 6);
    return label;
  }

  /** Key of a note still on screen (not released yet) of a visible hand. */
  #visibleKey(note: PlayableNote, now: number, layout: KeyboardLayout): KeyGeometry | undefined {
    return note.end > now && this.#options.visibleHands[note.hand] ? layout.keys.get(note.pitch) : undefined;
  }

  #renderFrame(): void {
    const layout = this.#layout;
    if (!layout) {
      return;
    }
    hideFrom(this.#glowList, 0);
    const now = this.#clock.heardSongTime();
    const pixelsPerSongSecond = this.#noteAreaHeight / VISIBLE_REAL_SECONDS / this.#clock.rate;
    const horizon = now + this.#noteAreaHeight / pixelsPerSongSecond;
    const notes = this.#timeline.notes;
    let used = 0;
    let named = 0;
    for (
      let i = firstNoteIndexAtOrAfter(notes, now - this.#timeline.maxNoteDuration);
      i < notes.length;
      i++
    ) {
      const note = notes[i];
      if (note === undefined || note.start > horizon) {
        break;
      }
      const key = this.#visibleKey(note, now, layout);
      const sprite = key ? this.#drawNote(note, i, key, now, pixelsPerSongSecond, used) : null;
      if (sprite && key) {
        used++;
        named += this.#nameNote(note, key, sprite, named) ? 1 : 0;
      }
    }
    hideFrom(this.#notePool, used);
    hideFrom(this.#namePool, named);
  }

  /** Name at the bottom of a falling note, when shown and when it fits. Returns true when a label was used. */
  #nameNote(note: PlayableNote, key: KeyGeometry, sprite: NineSliceSprite, index: number): boolean {
    const name = pitchClassName(note.pitch, this.#options.noteNaming);
    const fontSize = Math.floor(fittedFontSize(name, key.width, 13, 0.5));
    if (
      !namesOnNotes(this.#options.noteNames) ||
      key.width < MIN_NAMED_KEY_WIDTH ||
      fontSize < MIN_FONT_SIZE ||
      sprite.height < fontSize + 6
    ) {
      return false;
    }
    let label = this.#namePool[index];
    if (!label) {
      label = new Text({
        text: "",
        style: { fontFamily: FONT_FAMILY, fontWeight: "700", fill: NOTE_NAME_COLOR },
      });
      label.anchor.set(0.5, 1);
      this.#namePool.push(label);
      this.#noteNames.addChild(label);
    }
    if (label.text !== name) {
      label.text = name;
    }
    if (label.style.fontSize !== fontSize) {
      label.style.fontSize = fontSize;
    }
    label.position.set(key.x + key.width / 2, sprite.y + sprite.height - 3);
    label.visible = true;
    return true;
  }

  /** Returns the sprite used, or null when the note is not visible. */
  #drawNote(
    note: PlayableNote,
    noteIndex: number,
    key: KeyGeometry,
    now: number,
    pixelsPerSongSecond: number,
    index: number,
  ): NineSliceSprite | null {
    const color = this.#noteColor(note, noteIndex);
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
      return null;
    }
    const sprite = this.#noteSprite(index);
    sprite.position.set(key.x + 1, top);
    sprite.width = Math.max(1, key.width - 2);
    sprite.height = Math.max(1, bottom - top - NOTE_GAP_PX);
    sprite.tint = color;
    sprite.alpha = sounding ? 1 : 0.88;
    return sprite;
  }

  /** Hand color, or played / missed once judged on the piano. */
  #noteColor(note: PlayableNote, noteIndex: number): number {
    const mark = this.#marks?.[noteIndex] ?? 0;
    if (mark === MARK_PLAYED) {
      return COLORS.played;
    }
    if (mark === MARK_MISSED) {
      return COLORS.missed;
    }
    return note.hand === "left" ? COLORS.left : COLORS.right;
  }

  #noteSprite(index: number): NineSliceSprite {
    let sprite = this.#notePool[index];
    if (!sprite) {
      sprite = new NineSliceSprite({
        texture: this.#noteTexture,
        leftWidth: NOTE_RADIUS_PX,
        topHeight: NOTE_RADIUS_PX,
        rightWidth: NOTE_RADIUS_PX,
        bottomHeight: NOTE_RADIUS_PX,
      });
      this.#notePool.push(sprite);
      this.#notes.addChild(sprite);
    }
    sprite.visible = true;
    return sprite;
  }
}
