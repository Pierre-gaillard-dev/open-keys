import { type DetectedNote, midiToNoteName, type NoteNaming } from "@open-keys/core";
import { Check, Mic, MicOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { Button, ErrorBanner, SectionTitle, SegmentedControl } from "../../../shared/ui";
import { useNoteNaming } from "../../auth";
import { type MicrophoneStream, openMicrophone } from "../audio/microphone";
import type { EngineFrame, EngineKind, Sensitivity } from "../engines/listening-engine";
import { type Attempt, newAttempt, recentNotes, recordFrame } from "../lab/lab-attempt";
import { type EngineStatus, useLabEngine } from "../lab/use-lab-engine";

/** Screen refresh of the measures: the analysis runs tens of times per second, React is told 10 times. */
const DISPLAY_INTERVAL_MS = 100;
/** Notes stay lit this long after being heard, to be read. */
const SHOWN_S = 1;
const DELAY_SMOOTHING = 0.2;

const TARGETS = {
  single: { label: "Do du milieu", pitches: [60] },
  triad: { label: "Do majeur", pitches: [60, 64, 67] },
  hands: { label: "Deux mains", pitches: [45, 52, 60, 64, 69] },
  octave: { label: "Octave", pitches: [48, 60] },
  bass: { label: "Grave", pitches: [33, 40] },
} as const;
type TargetKey = keyof typeof TARGETS;

const ENGINES: readonly { value: EngineKind; label: string }[] = [
  { value: "dsp", label: "Détecteur maison" },
  { value: "basic-pitch", label: "Basic Pitch (IA)" },
];
const SENSITIVITIES: readonly { value: Sensitivity; label: string }[] = [
  { value: "low", label: "Basse" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Haute" },
];

/** Level of a chunk of samples, in dBFS. */
function levelOf(samples: Float32Array): number {
  let energy = 0;
  for (const sample of samples) {
    energy += sample * sample;
  }
  return Math.max(-100, 10 * Math.log10(energy / samples.length + 1e-12));
}

/** Written by the analysis, read by the display timer: never a React update per frame. */
interface Measures {
  level: number;
  notes: readonly DetectedNote[];
  /** Audio received so far (seconds): the audio clock of the attempt. */
  audioTime: number;
  /** Mean time between a sound and its frame (analysis included), seconds. */
  delayS: number;
}

interface Display {
  readonly level: number;
  readonly notes: readonly DetectedNote[];
  readonly heard: ReadonlySet<number>;
  readonly spreadS: number | null;
  readonly analysisMs: number;
  readonly delayS: number;
}

const EMPTY: Display = { level: -100, notes: [], heard: new Set(), spreadS: null, analysisMs: 0, delayS: 0 };

/**
 * Microphone lab (V1.5): what the app hears from a real piano, and whether it recognises the notes
 * asked for from one strike (wait mode). Two engines to compare on the Pixel and the PC, next to the
 * piano: the in-house detector and Basic Pitch.
 */
export function MicLabPage() {
  const naming = useNoteNaming();
  const [target, setTarget] = useState<TargetKey>("triad");
  const [kind, setKind] = useState<EngineKind>("dsp");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("medium");
  const [display, setDisplay] = useState<Display>(EMPTY);
  const [micError, setMicError] = useState<unknown>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const microphone = useRef<MicrophoneStream | null>(null);
  const measures = useRef<Measures>({ level: -100, notes: [], audioTime: 0, delayS: 0 });
  const attempt = useRef<Attempt>(newAttempt());
  const expected = TARGETS[target].pitches;

  const onFrame = (frame: EngineFrame) => {
    const m = measures.current;
    m.notes = frame.notes;
    const delay = m.audioTime - frame.time;
    m.delayS = m.delayS === 0 ? delay : m.delayS + (delay - m.delayS) * DELAY_SMOOTHING;
    recordFrame(attempt.current, frame.time, frame.heard, expected);
  };
  const {
    engine,
    status,
    error: engineError,
  } = useLabEngine(kind, sensitivity, sampleRate, expected, onFrame);

  // A new target starts a new attempt.
  useEffect(() => {
    attempt.current = newAttempt();
    engine.current?.expect(TARGETS[target].pitches);
  }, [target, engine]);

  useEffect(() => {
    const timer = setInterval(() => {
      const m = measures.current;
      setDisplay({
        level: m.level,
        notes: m.notes,
        heard: recentNotes(attempt.current, m.audioTime, SHOWN_S),
        spreadS: attempt.current.spreadS,
        analysisMs: engine.current?.analysisMs() ?? 0,
        delayS: m.delayS,
      });
    }, DISPLAY_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      void microphone.current?.stop();
    };
  }, [engine]);

  const start = async () => {
    setMicError(null);
    try {
      // Known once the microphone is open: chunks arriving before are ignored.
      let rate = 0;
      const stream = await openMicrophone((samples) => {
        if (rate === 0) {
          return;
        }
        measures.current.level = levelOf(samples);
        measures.current.audioTime += samples.length / rate;
        engine.current?.push(samples);
      });
      rate = stream.sampleRate;
      microphone.current = stream;
      setSampleRate(stream.sampleRate);
    } catch (cause) {
      setMicError(cause);
    }
  };

  const stop = async () => {
    await microphone.current?.stop();
    microphone.current = null;
    measures.current = { level: -100, notes: [], audioTime: 0, delayS: 0 };
    setSampleRate(null);
    setDisplay(EMPTY);
  };

  const running = sampleRate !== null;
  const levelPct = Math.min(100, Math.max(0, ((display.level + 70) / 70) * 100));

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-5 md:px-10 md:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Labo micro</h1>
        <p className="text-sm text-fg-muted">
          Essai de la détection au micro (V1.5) : pose le téléphone ou le PC près du piano, puis joue les
          notes demandées, d'une seule frappe. Rien n'est enregistré.
        </p>
      </header>
      {micError ? <ErrorBanner error={micError} title="Micro indisponible" /> : null}
      {engineError ? <ErrorBanner error={engineError} title="Moteur indisponible" /> : null}

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
        {running && <span className="text-xs text-fg-muted">{sampleRate} Hz</span>}
        <meter className="sr-only" min={-70} max={0} value={display.level}>
          Niveau du micro
        </meter>
        <div aria-hidden="true" className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-hand-left transition-[width]" style={{ width: `${levelPct}%` }} />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <SectionTitle>Moteur</SectionTitle>
        <SegmentedControl label="Moteur de détection" options={ENGINES} value={kind} onChange={setKind} />
        <SegmentedControl
          label="Sensibilité"
          options={SENSITIVITIES}
          value={sensitivity}
          onChange={setSensitivity}
        />
        <EngineState status={status} running={running} display={display} />
      </section>

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
          <ExpectedNotes pitches={expected} heard={display.heard} naming={naming} />
          <Button variant="ghost" onClick={() => (attempt.current = newAttempt())}>
            <RotateCcw aria-hidden="true" className="size-4" /> Recommencer
          </Button>
        </div>
        <p role="status" className="text-sm text-fg-soft">
          {display.spreadS === null
            ? `${display.heard.size} / ${expected.length} notes entendues`
            : `Accord reconnu d'une frappe ✓ (${Math.round(display.spreadS * 1000)} ms entre la première et la dernière note)`}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Ce que le micro entend</SectionTitle>
        <HeardNotes notes={display.notes} running={running} naming={naming} />
        <p className="text-xs text-fg-muted">
          Détection libre, sans savoir ce qui est attendu : elle se trompe plus souvent que la vérification
          ci-dessus, qui est celle du mode attente.
        </p>
      </section>
    </div>
  );
}

function EngineState({
  status,
  running,
  display,
}: {
  readonly status: EngineStatus;
  readonly running: boolean;
  readonly display: Display;
}) {
  if (!running) {
    return <p className="text-xs text-fg-muted">Active le micro pour lancer le moteur.</p>;
  }
  if (status === "loading") {
    return <p className="text-xs text-fg-muted">Chargement du moteur…</p>;
  }
  if (status !== "ready") {
    return null;
  }
  return (
    <p className="text-xs text-fg-muted tabular-nums">
      Analyse : {display.analysisMs.toFixed(display.analysisMs < 10 ? 1 : 0)} ms · délai entre le son et la
      détection : {Math.round(display.delayS * 1000)} ms
    </p>
  );
}

function ExpectedNotes({
  pitches,
  heard,
  naming,
}: {
  readonly pitches: readonly number[];
  readonly heard: ReadonlySet<number>;
  readonly naming: NoteNaming;
}) {
  return pitches.map((pitch) => {
    const ok = heard.has(pitch);
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
  });
}

function HeardNotes({
  notes,
  running,
  naming,
}: {
  readonly notes: readonly DetectedNote[];
  readonly running: boolean;
  readonly naming: NoteNaming;
}) {
  const strongest = notes[0]?.strength || 1;
  return (
    <ul className="flex flex-col gap-1.5">
      {notes.slice(0, 8).map((note) => (
        <li key={note.pitch} className="flex items-center gap-3 text-sm">
          <span className="w-12 font-semibold tabular-nums">{midiToNoteName(note.pitch, naming)}</span>
          <span
            className="h-2 rounded-full bg-hand-right"
            style={{ width: `${Math.min(100, (note.strength / strongest) * 100)}%` }}
          />
        </li>
      ))}
      {running && notes.length === 0 && <li className="text-sm text-fg-muted">Silence</li>}
    </ul>
  );
}
