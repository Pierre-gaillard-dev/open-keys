import { useStore } from "zustand";
import { formatDuration } from "../../../shared/lib/format";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";

function percent(value: number, total: number): string {
  return `${total > 0 ? (value / total) * 100 : 0}%`;
}

/** Seekable progress (native range input for keyboard and screen readers), with the A-B loop drawn on it. */
export function ProgressBar({
  store,
  controller,
}: {
  readonly store: PlayerStore;
  readonly controller: PlayerController | null;
}) {
  const positionMs = useStore(store, (state) => state.positionMs);
  const durationMs = useStore(store, (state) => state.durationMs);
  const loop = useStore(store, (state) => state.loop);
  const loopEnabled = useStore(store, (state) => state.loopEnabled);
  const pendingStart = useStore(store, (state) => state.pendingLoopStartMs);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-6 items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-line" />
        <div className="absolute h-1 rounded-full bg-fg" style={{ width: percent(positionMs, durationMs) }} />
        {loop && (
          <div
            aria-hidden="true"
            className={`absolute h-4 rounded border ${loopEnabled ? "border-fg/60 bg-fg/15" : "border-fg/20 bg-fg/5"}`}
            style={{
              left: percent(loop.startMs, durationMs),
              width: percent(loop.endMs - loop.startMs, durationMs),
            }}
          />
        )}
        {pendingStart !== null && (
          <div
            aria-hidden="true"
            className="absolute h-4 w-0.5 bg-fg"
            style={{ left: percent(pendingStart, durationMs) }}
          />
        )}
        <input
          type="range"
          aria-label="Position dans le morceau"
          aria-valuetext={`${formatDuration(positionMs)} sur ${formatDuration(durationMs)}`}
          min={0}
          max={durationMs}
          step={100}
          value={positionMs}
          disabled={!controller}
          onChange={(event) => controller?.seekTo(Number(event.target.value))}
          className="absolute inset-x-0 h-6 w-full cursor-pointer opacity-0"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full bg-fg"
          style={{ left: percent(positionMs, durationMs) }}
        />
      </div>
      <div className="flex justify-between text-xs text-fg-muted">
        <span>{formatDuration(positionMs)}</span>
        {loop && (
          <span>
            A {formatDuration(loop.startMs)} · B {formatDuration(loop.endMs)}
          </span>
        )}
        <span>{formatDuration(durationMs)}</span>
      </div>
    </div>
  );
}
