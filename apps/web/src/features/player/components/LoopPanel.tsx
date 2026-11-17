import type { Loop } from "@open-keys/contracts";
import { Repeat, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useStore } from "zustand";
import { cx } from "../../../shared/lib/cx";
import { formatDuration } from "../../../shared/lib/format";
import { newId } from "../../../shared/lib/ids";
import { Button, ErrorBanner, IconButton } from "../../../shared/ui";
import { useDeleteLoop, useSaveLoop } from "../../practice";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";

export interface LoopPanelProps {
  readonly songId: string;
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
  readonly savedLoops: readonly Loop[];
  readonly onClose: () => void;
}

/** Save the current A-B loop with a name, or recall a saved one (UC-10). */
export function LoopPanel({ songId, store, controller, savedLoops, onClose }: LoopPanelProps) {
  const loop = useStore(store, (state) => state.loop);
  const tempoPct = useStore(store, (state) => state.tempoPct);
  const saveLoop = useSaveLoop();
  const deleteLoop = useDeleteLoop(songId);
  const [name, setName] = useState("");

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!loop) {
      return;
    }
    const id = newId();
    const now = Date.now();
    const trimmed = name.trim() || null;
    saveLoop.mutate(
      {
        id,
        loop: {
          songId,
          name: trimmed,
          startMs: loop.startMs,
          endMs: loop.endMs,
          targetTempoPct: null,
          bestTempoPct: tempoPct,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      },
      {
        onSuccess: () => {
          controller?.loopSaved(id, trimmed);
          setName("");
        },
      },
    );
  };

  return (
    <section
      aria-label="Boucles"
      className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/60"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Boucles</h2>
        <IconButton label="Fermer" onClick={onClose} className="size-9">
          <X aria-hidden="true" className="size-4" />
        </IconButton>
      </div>

      {loop && loop.id === null && (
        <form onSubmit={save} className="flex flex-col gap-2">
          <label className="text-sm text-fg-soft" htmlFor="loop-name">
            Boucle {formatDuration(loop.startMs)} – {formatDuration(loop.endMs)}
          </label>
          <div className="flex gap-2">
            <input
              id="loop-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mesures 12-16…"
              maxLength={80}
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={saveLoop.isPending}
              aria-label="Enregistrer la boucle"
            >
              <Save aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {saveLoop.error && <ErrorBanner error={saveLoop.error} />}
        </form>
      )}
      {!loop && (
        <p className="text-sm text-fg-muted">Pose A puis B pendant la lecture pour créer une boucle.</p>
      )}

      {savedLoops.length > 0 && (
        <ul className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {savedLoops.map((saved) => (
            <li key={saved.id} className="flex items-center">
              <button
                type="button"
                onClick={() =>
                  controller?.selectLoop({
                    startMs: saved.startMs,
                    endMs: saved.endMs,
                    id: saved.id,
                    name: saved.name,
                  })
                }
                className={cx(
                  "flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2",
                  loop?.id === saved.id && "bg-surface-2",
                )}
              >
                <Repeat aria-hidden="true" className="size-4 text-fg-muted" />
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{saved.name ?? "Boucle sans nom"}</span>
                  <span className="text-xs text-fg-muted">
                    {formatDuration(saved.startMs)} – {formatDuration(saved.endMs)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Supprimer la boucle ${saved.name ?? "sans nom"}`}
                disabled={deleteLoop.isPending}
                onClick={() => {
                  deleteLoop.mutate(saved.id);
                  if (loop?.id === saved.id) {
                    controller?.clearLoop();
                  }
                }}
                className="mr-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:text-danger"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {loop && (
        <Button variant="ghost" onClick={() => controller?.clearLoop()}>
          Retirer la boucle
        </Button>
      )}
    </section>
  );
}
