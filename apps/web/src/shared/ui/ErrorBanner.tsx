import { CircleAlert } from "lucide-react";
import { ApiError } from "../api";

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Une erreur inattendue est survenue.";
}

export interface ErrorBannerProps {
  readonly error: unknown;
  readonly title?: string;
}

/** Shows an API error (message + request id to correlate with server logs). */
export function ErrorBanner({ error, title }: ErrorBannerProps) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex flex-col gap-1">
        {title && <p className="font-semibold text-fg">{title}</p>}
        <p className="text-fg-soft">{messageOf(error)}</p>
        {requestId && <p className="text-xs text-fg-muted">Référence : {requestId}</p>}
      </div>
    </div>
  );
}
