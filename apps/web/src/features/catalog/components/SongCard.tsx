import type { SongSummary } from "@open-keys/contracts";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { difficultyDots } from "../../../shared/lib/format";
import { STATUS_LABELS } from "../../library";
import { SongCover } from "./SongCover";

export function SongCard({ song }: { readonly song: SongSummary }) {
  return (
    <Link to="/songs/$songId" params={{ songId: song.id }} className="group flex flex-col gap-2 rounded-2xl">
      <div className="relative">
        <SongCover
          songId={song.id}
          title={song.title}
          cover={song.cover}
          className="transition-transform group-hover:scale-[1.02]"
        />
        {song.library?.isFavorite && (
          <Heart
            role="img"
            aria-label="Favori"
            className="absolute top-2.5 left-2.5 size-4 fill-fg text-fg drop-shadow"
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <span className="truncate font-semibold">{song.title}</span>
        <span className="truncate text-sm text-fg-muted">{song.composer ?? "Compositeur inconnu"}</span>
        <span className="flex items-center justify-between text-xs">
          <span className="font-semibold text-fg-soft">
            {STATUS_LABELS[song.library?.status ?? "to_learn"]}
          </span>
          <span className="text-fg-muted">
            <span aria-hidden="true">{difficultyDots(song.difficulty)}</span>
            <span className="sr-only">
              {song.difficulty === null ? "Difficulté non renseignée" : `Difficulté ${song.difficulty} sur 5`}
            </span>
          </span>
        </span>
      </div>
    </Link>
  );
}
