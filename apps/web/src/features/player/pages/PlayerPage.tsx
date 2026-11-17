import { Link } from "@tanstack/react-router";
import { buttonClasses, ErrorBanner } from "../../../shared/ui";
import { useSong } from "../../catalog";
import { useLibraryEntry } from "../../library";
import { useLoops } from "../../practice";
import { useTimeline } from "../api/player.queries";
import { PlayerView } from "../components/PlayerView";
import { usePlayerRuntime } from "../hooks/use-player-runtime";

/**
 * UC-08: watch and listen. Loads the song and decodes the piano samples in parallel, then hands over to
 * the full-screen player.
 */
export function PlayerPage({ songId }: { readonly songId: string }) {
  const song = useSong(songId);
  const timeline = useTimeline(song.data);
  const library = useLibraryEntry(songId);
  const loops = useLoops(songId);
  const { runtime, samples } = usePlayerRuntime();
  const error = song.error ?? timeline.error;

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-6">
        <ErrorBanner error={error} title="Impossible d'ouvrir le lecteur" />
        <Link to="/songs/$songId" params={{ songId }} className={buttonClasses("secondary")}>
          Retour à la fiche
        </Link>
      </div>
    );
  }
  if (!(song.data && timeline.data && library.isFetched && loops.isFetched && runtime)) {
    return (
      <p role="status" className="p-10 text-center text-fg-soft">
        Préparation du morceau…
      </p>
    );
  }
  return (
    <PlayerView
      song={song.data}
      timeline={timeline.data}
      libraryEntry={library.data ?? null}
      savedLoops={loops.data ?? []}
      runtime={runtime}
      samples={samples}
    />
  );
}
