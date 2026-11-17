import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { buttonClasses, ErrorBanner } from "../../../shared/ui";
import { useSong, useUpdateSong } from "../../catalog";
import { useChangeCover } from "../api/import.queries";
import { SongEditor } from "../components/SongEditor";
import type { SongEditableFields } from "../song-form";

/** UC-06: edit a song of the catalogue with the same editor as the import review. */
export function SongEditPage({ songId }: { readonly songId: string }) {
  const song = useSong(songId);
  const update = useUpdateSong(songId);
  const cover = useChangeCover(songId);
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: async ({
      fields,
      suggestionId,
    }: {
      fields: SongEditableFields;
      suggestionId: string | null;
    }) => {
      await update.mutateAsync(fields);
      if (suggestionId) {
        await cover.mutateAsync({ kind: "set", request: { suggestionId } });
      }
    },
    onSuccess: () => void navigate({ to: "/songs/$songId", params: { songId } }),
  });

  if (song.error) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-10">
        <ErrorBanner error={song.error} title="Morceau introuvable" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-5 md:px-10 md:py-8">
      <Link
        to="/songs/$songId"
        params={{ songId }}
        className="flex items-center gap-1 self-start py-2 text-sm text-fg-muted hover:text-fg"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Fiche du morceau
      </Link>
      <h1 className="font-display text-3xl font-bold tracking-tight">Modifier le morceau</h1>
      {song.data && (
        <SongEditor
          song={song.data}
          submitLabel="Enregistrer"
          submitting={save.isPending}
          error={save.error}
          onSubmit={(fields, suggestionId) => save.mutate({ fields, suggestionId })}
          secondaryAction={
            <Link to="/songs/$songId" params={{ songId }} className={buttonClasses("secondary", "lg")}>
              Annuler
            </Link>
          }
        />
      )}
    </div>
  );
}
