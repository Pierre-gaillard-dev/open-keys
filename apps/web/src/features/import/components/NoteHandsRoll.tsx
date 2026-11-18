import type { Hand, NoteHands, ParsedNote } from "@open-keys/core";
import { Minus, Plus } from "lucide-react";
import { type PointerEvent, useMemo, useRef, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { Button, IconButton } from "../../../shared/ui";

export interface NoteHandsRollProps {
  readonly notes: readonly ParsedNote[];
  readonly hands: NoteHands;
  /** Corrections allowed (PC): selection with the mouse, then a hand for the selection. */
  readonly editable: boolean;
  readonly onAssign: (indexes: readonly number[], hand: Hand) => void;
}

const ROLL_HEIGHT_PX = 320;
const ZOOM_STEPS = [10, 20, 40, 70, 120, 200] as const;
const DEFAULT_ZOOM = 2;
const MIDDLE_C = 60;
/** Below this many pixels, a drag is a click. */
const CLICK_TOLERANCE_PX = 4;

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const FILL: Readonly<Record<Hand, string>> = { left: "fill-hand-left", right: "fill-hand-right" };

function normalize(box: Box): Box {
  return {
    x0: Math.min(box.x0, box.x1),
    y0: Math.min(box.y0, box.y1),
    x1: Math.max(box.x0, box.x1),
    y1: Math.max(box.y0, box.y1),
  };
}

/**
 * The notes of the song over time, coloured by hand (D28). On PC, a rectangle drawn with the mouse
 * selects notes (Shift adds to the selection), then the buttons give them to a hand.
 */
export function NoteHandsRoll({ notes, hands, editable, onAssign }: NoteHandsRollProps) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [drag, setDrag] = useState<Box | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const geometry = useMemo(() => {
    const played = notes.filter((_, index) => hands[index] !== undefined);
    const pitches = (played.length > 0 ? played : notes).map((note) => note.pitch);
    const low = Math.min(...pitches, MIDDLE_C) - 1;
    const high = Math.max(...pitches, MIDDLE_C) + 1;
    const duration = Math.max(1, ...notes.map((note) => note.end));
    return { low, high, duration, row: ROLL_HEIGHT_PX / (high - low + 1) };
  }, [notes, hands]);

  const pxPerSecond = ZOOM_STEPS[zoom] ?? 70;
  const width = Math.ceil(geometry.duration * pxPerSecond);
  const xOf = (time: number) => time * pxPerSecond;
  const yOf = (pitch: number) => (geometry.high - pitch) * geometry.row;
  const leftCount = hands.filter((hand) => hand === "left").length;
  const rightCount = hands.filter((hand) => hand === "right").length;

  const pointAt = (event: PointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const notesIn = (box: Box): number[] =>
    notes.flatMap((note, index) => {
      if (hands[index] === undefined) {
        return [];
      }
      const top = yOf(note.pitch);
      const hit =
        xOf(note.end) >= box.x0 && xOf(note.start) <= box.x1 && top + geometry.row >= box.y0 && top <= box.y1;
      return hit ? [index] : [];
    });

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!editable || event.button !== 0) {
      return;
    }
    // Keeps receiving the moves when the pointer leaves the roll (missing in some test DOMs).
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const { x, y } = pointAt(event);
    setDrag({ x0: x, y0: y, x1: x, y1: y });
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (drag) {
      const { x, y } = pointAt(event);
      setDrag({ ...drag, x1: x, y1: y });
    }
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) {
      return;
    }
    const box = normalize(drag);
    const isClick = box.x1 - box.x0 < CLICK_TOLERANCE_PX && box.y1 - box.y0 < CLICK_TOLERANCE_PX;
    // A click picks the note under the pointer (or clears the selection on empty space).
    const picked = notesIn(isClick ? { x0: box.x0, y0: box.y0, x1: box.x0, y1: box.y0 } : box);
    setSelection((current) => new Set(event.shiftKey ? [...current, ...picked] : picked));
    setDrag(null);
  };

  const assign = (hand: Hand) => {
    onAssign([...selection], hand);
    setSelection(new Set());
  };

  const box = drag && normalize(drag);
  const cLines = [];
  for (let pitch = Math.ceil(geometry.low / 12) * 12; pitch <= geometry.high; pitch += 12) {
    cLines.push(pitch);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-xs text-fg-muted">
          <span className="text-hand-left">{leftCount} notes à gauche</span> ·{" "}
          <span className="text-hand-right">{rightCount} à droite</span>
          {editable && " · glisser pour sélectionner, Maj pour ajouter"}
        </p>
        <IconButton
          label="Dézoomer"
          className="size-9"
          disabled={zoom === 0}
          onClick={() => setZoom(zoom - 1)}
        >
          <Minus aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          label="Zoomer"
          className="size-9"
          disabled={zoom === ZOOM_STEPS.length - 1}
          onClick={() => setZoom(zoom + 1)}
        >
          <Plus aria-hidden="true" className="size-4" />
        </IconButton>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-bg">
        <svg
          ref={svg}
          role="img"
          aria-label={`Répartition des mains : ${leftCount} notes à gauche, ${rightCount} à droite`}
          width={width}
          height={ROLL_HEIGHT_PX}
          className={cx("block touch-pan-x", editable && "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {cLines.map((pitch) => (
            <line
              key={pitch}
              x1={0}
              x2={width}
              y1={yOf(pitch) + geometry.row}
              y2={yOf(pitch) + geometry.row}
              className={pitch === MIDDLE_C ? "stroke-fg-muted" : "stroke-line"}
              strokeDasharray={pitch === MIDDLE_C ? "4 4" : undefined}
            />
          ))}
          {notes.map((note, index) => {
            const hand = hands[index];
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: notes are fixed for a song, the index is their identity
                key={index}
                x={xOf(note.start)}
                y={yOf(note.pitch)}
                width={Math.max(2, xOf(note.end) - xOf(note.start))}
                height={Math.max(2, geometry.row - 1)}
                rx={1}
                className={cx(
                  hand ? FILL[hand] : "fill-fg-muted opacity-25",
                  selection.has(index) && "stroke-fg stroke-2",
                )}
              />
            );
          })}
          {box && (
            <rect
              x={box.x0}
              y={box.y0}
              width={box.x1 - box.x0}
              height={box.y1 - box.y0}
              className="fill-fg/10 stroke-fg"
              strokeDasharray="3 3"
            />
          )}
        </svg>
      </div>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className="mr-auto text-sm text-fg-soft">
            {selection.size === 0
              ? "Aucune note sélectionnée"
              : `${selection.size} note${selection.size > 1 ? "s" : ""} sélectionnée${selection.size > 1 ? "s" : ""}`}
          </span>
          <Button disabled={selection.size === 0} onClick={() => assign("left")}>
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-hand-left" />
            Main gauche
          </Button>
          <Button disabled={selection.size === 0} onClick={() => assign("right")}>
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-hand-right" />
            Main droite
          </Button>
        </div>
      )}
    </div>
  );
}
