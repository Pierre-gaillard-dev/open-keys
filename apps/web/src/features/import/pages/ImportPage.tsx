import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Upload } from "lucide-react";
import { type DragEvent, type FormEvent, useState } from "react";
import { cx } from "../../../shared/lib/cx";
import { Button, TextField } from "../../../shared/ui";
import { useImportFile, useImportUrl } from "../api/import.queries";
import { ImportError } from "../components/ImportError";
import { ImportTabs, OnlineSearchEntry } from "../components/ImportTabs";

export function ImportPage() {
  const navigate = useNavigate();
  const fileImport = useImportFile();
  const urlImport = useImportUrl();
  const [url, setUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const pending = fileImport.isPending || urlImport.isPending;
  const error = fileImport.error ?? urlImport.error;

  const openReview = (song: { id: string }) =>
    void navigate({ to: "/import/$songId", params: { songId: song.id } });

  const importSelected = (file: File | undefined) => {
    if (file) {
      urlImport.reset();
      fileImport.mutate(file, { onSuccess: openReview });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    importSelected(event.dataTransfer.files[0]);
  };

  const submitUrl = (event: FormEvent) => {
    event.preventDefault();
    fileImport.reset();
    urlImport.mutate(url, { onSuccess: openReview });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-5 md:py-10">
      <Link to="/" className="flex items-center gap-1 self-start py-2 text-sm text-fg-muted hover:text-fg">
        <ChevronLeft aria-hidden="true" className="size-4" /> Catalogue
      </Link>
      <h1 className="font-display text-3xl font-bold tracking-tight">Importer un morceau</h1>
      <ImportTabs />
      <OnlineSearchEntry />

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
          pending && "pointer-events-none opacity-60",
        )}
      >
        <Upload aria-hidden="true" className="size-8 text-fg-soft" />
        <span className="font-semibold">
          {fileImport.isPending ? "Analyse…" : "Choisir ou déposer un fichier .mid"}
        </span>
        <span id="midi-size-hint" className="text-xs text-fg-muted">
          2 Mo maximum
        </span>
        <input
          type="file"
          aria-label="Fichier MIDI à importer"
          aria-describedby="midi-size-hint"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            importSelected(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>

      <div className="flex items-center gap-3 text-xs text-fg-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        ou
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submitUrl} className="flex flex-col gap-3">
        <TextField
          label="Depuis une URL"
          type="url"
          required
          placeholder="https://www.mutopiaproject.org/…/morceau.mid"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" variant="primary" disabled={pending || !url}>
          {urlImport.isPending ? "Téléchargement…" : "Analyser le fichier"}
        </Button>
      </form>

      {error && <ImportError error={error} />}
    </div>
  );
}
