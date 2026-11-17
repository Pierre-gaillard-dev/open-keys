import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../../shared/ui";
import { useApplyUpdate } from "./pwa.store";

/** Offers the new version of the app. Shown outside the player only: never reload during practice. */
export function UpdateBanner() {
  const applyUpdate = useApplyUpdate();
  const [updating, setUpdating] = useState(false);
  if (!applyUpdate) {
    return null;
  }
  return (
    <section
      aria-label="Mise à jour"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-surface-2 bg-surface px-4 py-2 text-sm"
    >
      <p className="text-fg-soft">Une nouvelle version d'Open Keys est disponible.</p>
      <Button
        disabled={updating}
        onClick={() => {
          setUpdating(true);
          void applyUpdate();
        }}
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Mettre à jour
      </Button>
    </section>
  );
}
