import { CloudOff } from "lucide-react";

/** A page whose data was never stored on the device, opened offline (UC-14). */
export function OfflineUnavailable({ what }: { readonly what: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
      <CloudOff aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-hand-right" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-fg">{what} n'est pas disponible hors-ligne.</p>
        <p className="text-fg-soft">
          Les morceaux déjà ouverts et les favoris restent jouables sans réseau. Celui-ci sera disponible au
          retour de la connexion.
        </p>
      </div>
    </div>
  );
}
