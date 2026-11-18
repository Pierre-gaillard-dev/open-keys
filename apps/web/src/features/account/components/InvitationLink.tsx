import type { CreatedInvitation } from "@open-keys/contracts";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../shared/ui";

const expiryFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** A link just made: shown once (the server keeps a hash), to copy or share right away. */
export function InvitationLink({ invitation }: { readonly invitation: CreatedInvitation }) {
  const url = `${window.location.origin}${invitation.path}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";
  const label =
    invitation.kind === "account"
      ? "Lien d'invitation"
      : `Lien de nouveau mot de passe pour ${invitation.username ?? "ce compte"}`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hand-left/40 bg-surface p-4">
      <p className="text-sm font-semibold">{label}</p>
      <input
        readOnly
        aria-label={label}
        value={url}
        onFocus={(event) => event.target.select()}
        className="h-11 rounded-xl border border-line bg-bg px-3 font-mono text-sm"
      />
      <p className="text-xs text-fg-muted">
        À usage unique, valable jusqu'à {expiryFormat.format(invitation.expiresAt)}. Il ne sera plus affiché
        ensuite.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()}>
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? "Copié" : "Copier"}
        </Button>
        {canShare && (
          <Button onClick={() => void navigator.share({ title: "Open Keys", url }).catch(() => undefined)}>
            <Share2 aria-hidden="true" className="size-4" />
            Partager
          </Button>
        )}
      </div>
    </div>
  );
}
