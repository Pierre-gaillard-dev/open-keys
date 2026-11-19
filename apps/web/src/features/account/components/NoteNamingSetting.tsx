import type { NoteNaming } from "@open-keys/core";
import { ErrorBanner, SegmentedControl } from "../../../shared/ui";
import { useUpdatePreferences } from "../api/account.queries";

const OPTIONS: readonly { value: NoteNaming; label: string }[] = [
  { value: "latin", label: "Do Ré Mi" },
  { value: "english", label: "C D E" },
];

/** Note names of the account (lecteur, import, labo micro), the same on every device. */
export function NoteNamingSetting({ value }: { readonly value: NoteNaming }) {
  const update = useUpdatePreferences();
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label="Noms des notes"
        options={OPTIONS}
        value={update.isPending ? (update.variables.noteNaming ?? value) : value}
        onChange={(noteNaming) => update.mutate({ noteNaming })}
        disabled={update.isPending}
      />
      <p className="text-xs text-fg-muted">En français, le do du milieu du piano est Do3 ; en anglais, C4.</p>
      {update.isError && <ErrorBanner error={update.error} title="Réglage non enregistré" />}
    </div>
  );
}
