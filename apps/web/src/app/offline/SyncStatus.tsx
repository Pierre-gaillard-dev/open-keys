import { CloudOff, RefreshCw } from "lucide-react";
import { outbox, useIsOnline, useOutboxPending } from "../../shared/offline";

/** Offline state and writes waiting to reach the server (UC-15). Nothing when all is in sync. */
export function SyncStatus() {
  const online = useIsOnline();
  const pending = useOutboxPending(outbox);
  if (online && pending === 0) {
    return null;
  }
  const waiting = pending > 0 ? `${pending} modification${pending > 1 ? "s" : ""} en attente` : null;
  const label = [online ? "Synchronisation" : "Hors-ligne", waiting].filter(Boolean).join(", ");
  return (
    <p
      role="status"
      aria-label={label}
      title={label}
      className="flex h-9 items-center gap-2 rounded-full bg-surface-2 px-3 text-xs font-semibold text-fg-soft"
    >
      {online ? (
        <RefreshCw aria-hidden="true" className="size-3.5 animate-spin text-hand-left" />
      ) : (
        <CloudOff aria-hidden="true" className="size-3.5 text-hand-right" />
      )}
      <span aria-hidden="true">{online ? "Synchronisation" : "Hors-ligne"}</span>
      {pending > 0 && (
        <span aria-hidden="true" className="rounded-full bg-bg px-1.5 tabular-nums">
          {pending}
        </span>
      )}
    </p>
  );
}
