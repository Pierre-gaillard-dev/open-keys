import type { SongDetail } from "@open-keys/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Pencil, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { difficultyDots, formatDuration } from "../../../shared/lib/format";
import { Button, buttonClasses, ErrorBanner, OfflineUnavailable, SectionTitle } from "../../../shared/ui";
import { FavoriteToggle, StatusControl, useLibraryEntry } from "../../library";
import { PracticeSummary } from "../../practice";
import { useDeleteSong, useSong } from "../api/catalog.queries";
import { SongCover } from "../components/SongCover";

const SOURCE_LABELS: Readonly<Record<SongDetail["sourceType"], string>> = {
  upload: "Fichier importé",
  url: "Téléchargé depuis une URL",
  mutopia: "Mutopia Project",
};

function InfoRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function SongInfo({ song }: { readonly song: SongDetail }) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
      <InfoRow label="Source">
        {song.sourceUrl ? (
          <a href={song.sourceUrl} className="text-hand-left hover:underline">
            {new URL(song.sourceUrl).hostname}
          </a>
        ) : (
          SOURCE_LABELS[song.sourceType]
        )}
      </InfoRow>
      <InfoRow label="Licence">{song.license ?? "Non renseignée"}</InfoRow>
      <InfoRow label="Mains">
        {song.handMode === "tracks" ? `Par piste (${song.tracks.length})` : "Par hauteur"}
      </InfoRow>
      <InfoRow label="Notes">{song.noteCount}</InfoRow>
      {song.cover?.credit && <InfoRow label="Couverture">{song.cover.credit}</InfoRow>}
    </dl>
  );
}

export function SongDetailPage({ songId }: { readonly songId: string }) {
  const song = useSong(songId);
  const library = useLibraryEntry(songId);
  const resumeAtMs = library.data?.lastPositionMs ?? 0;
  const deletion = useDeleteSong(songId);
  const navigate = useNavigate();

  const remove = () => {
    if (window.confirm("Supprimer ce morceau ? Il reste récupérable 30 jours en le réimportant.")) {
      deletion.mutate(undefined, { onSuccess: () => void navigate({ to: "/" }) });
    }
  };

  // Offline, the stored data is shown even if refreshing it failed.
  if (song.error && !song.data) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-10">
        <ErrorBanner error={song.error} title="Morceau introuvable" />
      </div>
    );
  }
  if (!song.data && song.fetchStatus === "paused") {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-10">
        <OfflineUnavailable what="Ce morceau" />
      </div>
    );
  }
  const data = song.data;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-5 md:px-10 md:py-8">
      <div className="flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1 py-2 text-sm text-fg-muted hover:text-fg">
          <ChevronLeft aria-hidden="true" className="size-4" /> Catalogue
        </Link>
        {data && (
          <div className="flex gap-2">
            <FavoriteToggle songId={songId} />
            <Link
              to="/songs/$songId/edit"
              params={{ songId }}
              aria-label="Modifier le morceau"
              className={buttonClasses("secondary")}
            >
              <Pencil aria-hidden="true" className="size-4" />{" "}
              <span className="hidden md:inline">Modifier</span>
            </Link>
          </div>
        )}
      </div>

      {/* Desktop: cover (rows 1-2) + actions (row 3) on the left; header (row 1) + content (rows 2-4) on the
          right. The last row is flexible so the content height never pushes the actions down. */}
      {data && (
        <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-6 md:grid-cols-[20rem_minmax(0,1fr)] md:grid-rows-[auto_auto_auto_1fr] md:gap-x-10">
          <SongCover
            songId={data.id}
            title={data.title}
            cover={data.cover}
            className="self-end md:row-span-2 md:self-start"
            titleClassName="text-lg md:text-3xl"
          />
          <header className="flex min-w-0 flex-col justify-end gap-1 md:justify-start md:gap-1.5">
            <h1 className="font-display text-2xl leading-tight font-bold md:text-4xl md:tracking-tight">
              {data.title}
            </h1>
            <p className="text-fg-soft md:text-lg">{data.composer ?? "Compositeur inconnu"}</p>
          </header>
          <section className="col-span-2 flex flex-col gap-4 md:col-span-1 md:col-start-1 md:row-start-3 md:self-start">
            <Link to="/songs/$songId/play" params={{ songId }} className={buttonClasses("primary", "lg")}>
              <Play aria-hidden="true" className="size-4 fill-current" />
              {resumeAtMs > 0 ? `Reprendre à ${formatDuration(resumeAtMs)}` : "Jouer"}
            </Link>
            <StatusControl songId={songId} />
          </section>

          <section className="col-span-2 flex min-w-0 flex-col gap-7 md:col-span-1 md:col-start-2 md:row-span-3 md:row-start-2">
            <div className="flex flex-wrap gap-2 text-xs text-fg-soft">
              <span className="rounded-lg bg-surface-2 px-2.5 py-1.5">{formatDuration(data.durationMs)}</span>
              <span className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                Difficulté {difficultyDots(data.difficulty)}
              </span>
              {data.tags.map((tag) => (
                <span key={tag} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                  #{tag}
                </span>
              ))}
            </div>
            <PracticeSummary songId={songId} />
            <section className="flex flex-col gap-3">
              <SectionTitle>Infos</SectionTitle>
              <SongInfo song={data} />
            </section>
            {deletion.error && <ErrorBanner error={deletion.error} />}
            <Button variant="danger" className="self-start" onClick={remove} disabled={deletion.isPending}>
              <Trash2 aria-hidden="true" className="size-4" /> Supprimer
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
