import type { SongStatus } from "@open-keys/contracts";
import { SegmentedControl } from "../../../shared/ui";
import { useLibraryEntry, useUpdateLibraryEntry } from "../api/library.queries";
import { STATUS_OPTIONS } from "../status-labels";

export function StatusControl({ songId }: { readonly songId: string }) {
  const entry = useLibraryEntry(songId);
  const update = useUpdateLibraryEntry(songId);
  return (
    <SegmentedControl<SongStatus>
      label="Statut"
      options={STATUS_OPTIONS}
      value={entry.data?.status ?? "to_learn"}
      disabled={entry.isPending}
      onChange={(status) => update.mutate({ status })}
    />
  );
}
