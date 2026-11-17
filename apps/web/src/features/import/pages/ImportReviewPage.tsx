import { Link, useNavigate } from "@tanstack/react-router";
import { formatDuration } from "../../../shared/lib/format";
import { buttonClasses, ErrorBanner } from "../../../shared/ui";
import { useSong } from "../../catalog";
import { useConfirmImport } from "../api/import.queries";
import { SongEditor } from "../components/SongEditor";

/** UC-04: review a freshly imported draft before it joins the catalogue. */
export function ImportReviewPage({ songId }: { readonly songId: string }) {
  const song = useSong(songId);
  const confirm = useConfirmImport(songId);
  const navigate = useNavigate();

  if (song.error) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-10">
        <ErrorBanner error={song.error} title="Import introuvable (les brouillons expirent après 24 h)" />
      </div>
    );
  }
  const data = song.data;
  if (data && data.state === "ready") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 md:p-10">
        <p>Ce morceau est déjà dans le catalogue.</p>
        <Link to="/songs/$songId" params={{ songId }} className={buttonClasses("primary")}>
          Ouvrir la fiche
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-5 md:px-10 md:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Vérifier l'import</h1>
        {data && (
          <p className="text-sm text-fg-muted">
            {formatDuration(data.durationMs)} · {data.tracks.length} piste{data.tracks.length > 1 ? "s" : ""}{" "}
            · {data.noteCount} notes
          </p>
        )}
      </header>
      {data && (
        <SongEditor
          song={data}
          submitLabel="Ajouter au catalogue"
          submitting={confirm.isPending}
          error={confirm.error}
          onSubmit={(fields, coverSuggestionId) =>
            confirm.mutate(
              { ...fields, ...(coverSuggestionId ? { coverSuggestionId } : {}) },
              { onSuccess: () => void navigate({ to: "/songs/$songId", params: { songId } }) },
            )
          }
          secondaryAction={
            <Link to="/import" className={buttonClasses("secondary", "lg")}>
              Annuler
            </Link>
          }
        />
      )}
    </div>
  );
}
