import { type DetectedNote, midiToNoteName, NoteListener } from "@open-keys/core";
import { Check, Mic, MicOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { Button, ErrorBanner, SectionTitle, SegmentedControl } from "../../../shared/ui";
import { useNoteNaming } from "../../auth";
import { type MicrophoneStream, openMicrophone } from "../audio/microphone";

/** Screen refresh of the measures: the analysis runs at ~47 frames per second, React is told 10 times. */
const DISPLAY_INTERVAL_MS = 100;
/** A note counts once heard in this many frames in a row (21 ms each). */
const REQUIRED_FRAMES = 2;

const TARGETS = {
  single: { label: "Do du milieu", pitches: [60] },
  triad: { label: "Do majeur", pitches: [60, 64, 67] },
  hands: { label: "Deux mains", pitches: [45, 52, 60, 64, 69] },
  octave: { label: "Octave", pitches: [48, 60] },
  bass: { label: "Grave", pitches: [33, 40] },
} as const;
type TargetKey = keyof typeof TARGETS;

interface Attempt {
  /** Frames in a row each expected note has been heard in. */
  readonly streaks: Map<number, number>;
  readonly heard: Set<number>;
  firstAt: number;
  doneAfter: number | null;
}

const newAttempt = (): Attempt => ({ streaks: new Map(), heard: new Set(), firstAt: 0, doneAfter: null });

/** Level of a chunk of samples, in dBFS. */
function levelOf(samples: Float32Array): number {
  let energy = 0;
  for (const sample of samples) {
    energy += sample * sample;
  }
  return Math.max(-100, 10 * Math.log10(energy / samples.length + 1e-12));
}

/** An expected note counts once heard in REQUIRED_FRAMES frames in a row. */
function recordFrame(attempt: Attempt, heard: readonly number[], expected: readonly number[]): void {
  for (const pitch of expected) {
    const streak = heard.includes(pitch) ? (attempt.streaks.get(pitch) ?? 0) + 1 : 0;
    attempt.streaks.set(pitch, streak);
    if (streak >= REQUIRED_FRAMES && !attempt.heard.has(pitch)) {
      attempt.firstAt ||= performance.now();
      attempt.heard.add(pitch);
    }
  }
  if (attempt.doneAfter === null && attempt.heard.size === expected.length) {
    attempt.doneAfter = performance.now() - attempt.firstAt;
  }
}

interface Display {
  readonly level: number;
  readonly notes: readonly DetectedNote[];
  readonly heard: ReadonlySet<number>;
  /** Time from the first expected note heard to the whole chord heard, or null. */
  readonly completedAfterMs: number | null;
}

const EMPTY: Display = { level: -100, notes: [], heard: new Set(), completedAfterMs: null };

/**
 * Microphone lab (V1.5 spike): what the app hears from a real piano, and whether it recognises the
 * notes asked for (wait mode). Measures to collect on the Pixel and the PC, next to the piano.
 */
export function MicLabPage() {
  const naming = useNoteNaming();
  const [target, setTarget] = useState<TargetKey>("triad");
  const [display, setDisplay] = useState<Display>(EMPTY);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const microphone = useRef<MicrophoneStream | null>(null);
  // Read by the capture callback, created once when the microphone opens.
  const targetRef = useRef<TargetKey>(target);
  targetRef.current = target;
  const listener = useRef<NoteListener | null>(null);
  // Measures written by the analysis, read by the display timer.
  const measures = useRef({ level: -100, notes: [] as readonly DetectedNote[] });
  const attempt = useRef<Attempt>(newAttempt());

  const resetAttempt = () => {
    attempt.current = newAttempt();
    listener.current?.expect(TARGETS[target].pitches);
  };

  // A new target starts a new attempt.
  useEffect(resetAttempt, [target]);

  useEffect(() => {
    const timer = setInterval(() => {
      const { heard, doneAfter } = attempt.current;
      setDisplay({ ...measures.current, heard: new Set(heard), completedAfterMs: doneAfter });
    }, DISPLAY_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      void microphone.current?.stop();
    };
  }, []);

  const onSamples = (samples: Float32Array) => {
    measures.current.level = levelOf(samples);
    const expected = TARGETS[targetRef.current].pitches;
    for (const frame of listener.current?.push(samples) ?? []) {
      measures.current.notes = frame.notes;
      recordFrame(attempt.current, frame.heard, expected);
    }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await openMicrophone((samples) => onSamples(samples));
      listener.current = new NoteListener({ sampleRate: stream.sampleRate });
      listener.current.expect(TARGETS[target].pitches);
      microphone.current = stream;
      setSampleRate(stream.sampleRate);
      setRunning(true);
    } catch (cause) {
      setError(cause);
    }
  };

  const stop = async () => {
    await microphone.current?.stop();
    microphone.current = null;
    listener.current = null;
    setRunning(false);
    setDisplay(EMPTY);
  };

  const expected = TARGETS[target].pitches;
  const levelPct = Math.min(100, Math.max(0, ((display.level + 70) / 70) * 100));

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-5 md:px-10 md:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Labo micro</h1>
        <p className="text-sm text-fg-muted">
          Essai de la détection au micro (V1.5) : pose le téléphone ou le PC près du piano, puis joue les
          notes demandées. Rien n'est enregistré.
        </p>
      </header>
      {error ? <ErrorBanner error={error} title="Micro indisponible" /> : null}

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <Button onClick={() => void stop()}>
            <MicOff aria-hidden="true" className="size-4" /> Arrêter le micro
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void start()}>
            <Mic aria-hidden="true" className="size-4" /> Activer le micro
          </Button>
        )}
        {sampleRate && running && <span className="text-xs text-fg-muted">{sampleRate} Hz</span>}
        <meter className="sr-only" min={-70} max={0} value={display.level}>
          Niveau du micro
        </meter>
        <div aria-hidden="true" className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-hand-left transition-[width]" style={{ width: `${levelPct}%` }} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Joue</SectionTitle>
        <SegmentedControl
          label="Notes à jouer"
          options={Object.entries(TARGETS).map(([value, { label }]) => ({
            value: value as TargetKey,
            label,
          }))}
          value={target}
          onChange={setTarget}
        />
        <div className="flex flex-wrap items-center gap-2">
          {expected.map((pitch) => {
            const ok = display.heard.has(pitch);
            return (
              <span
                key={pitch}
                className={cx(
                  "flex items-center gap-1.5 rounded-xl border px-3 py-2 font-semibold",
                  ok ? "border-hand-left bg-hand-left/15 text-fg" : "border-line text-fg-soft",
                )}
              >
                {ok && <Check aria-hidden="true" className="size-4 text-hand-left" />}
                {midiToNoteName(pitch, naming)}
              </span>
            );
          })}
          <Button variant="ghost" onClick={resetAttempt}>
            <RotateCcw aria-hidden="true" className="size-4" /> Recommencer
          </Button>
        </div>
        <p role="status" className="text-sm text-fg-soft">
          {display.completedAfterMs === null
            ? `${display.heard.size} / ${expected.length} notes entendues`
            : `Accord reconnu ✓ (${Math.round(display.completedAfterMs)} ms entre la première et la dernière note)`}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Ce que le micro entend</SectionTitle>
        <ul className="flex flex-col gap-1.5">
          {display.notes.slice(0, 8).map((note) => (
            <li key={note.pitch} className="flex items-center gap-3 text-sm">
              <span className="w-12 font-semibold tabular-nums">{midiToNoteName(note.pitch, naming)}</span>
              <span
                className="h-2 rounded-full bg-hand-right"
                style={{
                  width: `${Math.min(100, (note.strength / (display.notes[0]?.strength || 1)) * 100)}%`,
                }}
              />
            </li>
          ))}
          {running && display.notes.length === 0 && <li className="text-sm text-fg-muted">Silence</li>}
        </ul>
        <p className="text-xs text-fg-muted">
          Détection libre, sans savoir ce qui est attendu : elle se trompe plus souvent que la vérification
          ci-dessus, qui est celle du mode attente.
        </p>
      </section>
    </div>
  );
}
