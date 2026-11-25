import { AUDIO_EXTENSIONS, MAX_TRANSCRIPTION_SECONDS, type TranscriptionJob } from "@open-keys/contracts";
import { Link } from "@tanstack/react-router";
import { AudioLines, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle } from "lucide-react";
import { type DragEvent, type FormEvent, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { Button, ErrorBanner, SectionTitle, TextField } from "../../../shared/ui";
import {
  useSubmitTranscription,
  useSubmitTranscriptionUrl,
  useTranscriptions,
} from "../api/transcriptions.queries";
import { ImportTabs } from "../components/ImportTabs";
import { audioDuration, statusText } from "../transcription-status";

/**
 * Import from a recording of piano (D34): the server transcribes it (notes, pedal, beats), then the
 * draft is reviewed like an imported MIDI file. Transcribing takes a few minutes: the list follows it.
 */
export function AudioImportPage() {
  const transcriptions = useTranscriptions();
  const submit = useSubmitTranscription();
  const submitUrl = useSubmitTranscriptionUrl();
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState("");
  const available = transcriptions.data?.available ?? true;
  const acceptsUrls = transcriptions.data?.acceptsUrls ?? false;

  const sendUrl = (event: FormEvent) => {
    event.preventDefault();
    submitUrl.mutate(url, { onSuccess: () => setUrl("") });
  };

  const send = async (file: File | undefined) => {
    if (file) {
      submit.mutate({ file, durationS: await audioDuration(file) });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void send(event.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-5 md:py-10">
      <Link
        to="/import"
        className="flex items-center gap-1 self-start py-2 text-sm text-fg-muted hover:text-fg"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Importer
      </Link>
      <h1 className="font-display text-3xl font-bold tracking-tight">Depuis un enregistrement</h1>
      <ImportTabs />
      <p className="text-sm text-fg-soft">
        Un enregistrement de <strong>piano seul</strong> (reprise, tutoriel) devient un morceau : notes,
        pédale et tempo. La transcription prend quelques minutes sur le serveur ; tu peux quitter la page.
        L'enregistrement est gardé avec le morceau, pour jouer avec le vrai son.
      </p>

      {!available ? (
        <p role="status" className="rounded-2xl border border-line bg-surface p-4 text-sm text-fg-soft">
          Ce serveur n'a pas de service de transcription : l'import d'enregistrements n'y est pas disponible.
        </p>
      ) : (
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed bg-surface",
            dragging ? "border-hand-left" : "border-line-strong",
            submit.isPending && "pointer-events-none opacity-60",
          )}
        >
          <AudioLines aria-hidden="true" className="size-8 text-fg-soft" />
          <span className="font-semibold">
            {submit.isPending ? "Envoi…" : "Choisir ou déposer un enregistrement"}
          </span>
          <span id="audio-hint" className="text-xs text-fg-muted">
            mp3, opus, m4a, wav… · {MAX_TRANSCRIPTION_SECONDS / 60} minutes et 40 Mo au plus
          </span>
          <input
            type="file"
            aria-label="Enregistrement à transcrire"
            aria-describedby="audio-hint"
            accept={["audio/*", ...AUDIO_EXTENSIONS].join(",")}
            className="sr-only"
            disabled={submit.isPending}
            onChange={(event) => {
              void send(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      )}
      {available && acceptsUrls && (
        <form onSubmit={sendUrl} className="flex flex-col gap-3">
          <TextField
            label="Depuis une adresse"
            type="url"
            required
            placeholder="https://…/morceau.opus"
            hint="Un enregistrement de ton app de musique : le morceau garde son adresse, pour jouer avec le vrai son."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" variant="primary" disabled={submitUrl.isPending || !url}>
            {submitUrl.isPending ? "Envoi…" : "Transcrire"}
          </Button>
        </form>
      )}
      {submit.error && <ErrorBanner error={submit.error} title="Envoi impossible" />}
      {submitUrl.error && <ErrorBanner error={submitUrl.error} title="Envoi impossible" />}

      <section className="flex flex-col gap-3">
        <SectionTitle>Transcriptions</SectionTitle>
        <TranscriptionList jobs={transcriptions.data?.jobs ?? []} />
      </section>
    </div>
  );
}

function TranscriptionList({ jobs }: { readonly jobs: readonly TranscriptionJob[] }) {
  if (jobs.length === 0) {
    return <p className="text-sm text-fg-muted">Les enregistrements envoyés apparaissent ici.</p>;
  }
  const now = Date.now();
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
      {jobs.map((job) => (
        <li key={job.id} className="flex items-center gap-3 px-4 py-3">
          <JobIcon job={job} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{job.fileName}</span>
            <span className={cx("text-sm", job.status === "failed" ? "text-danger" : "text-fg-muted")}>
              {statusText(job, now)}
            </span>
          </div>
          {job.status === "done" && job.songId && (
            <Link
              to="/import/$songId"
              params={{ songId: job.songId }}
              className="flex items-center gap-1 text-sm font-semibold text-hand-left hover:underline"
            >
              Vérifier <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function JobIcon({ job }: { readonly job: TranscriptionJob }) {
  if (job.status === "failed") {
    return <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-danger" />;
  }
  if (job.status === "done") {
    return <AudioLines aria-hidden="true" className="size-5 shrink-0 text-hand-left" />;
  }
  return <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-fg-muted" />;
}
