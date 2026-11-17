import type { SongStatus } from "@open-keys/contracts";
import type { SegmentedOption } from "../../shared/ui";

export const STATUS_LABELS: Readonly<Record<SongStatus, string>> = {
  to_learn: "À apprendre",
  learning: "En cours",
  mastered: "Maîtrisé",
};

export const STATUS_OPTIONS: readonly SegmentedOption<SongStatus>[] = [
  { value: "to_learn", label: STATUS_LABELS.to_learn },
  { value: "learning", label: STATUS_LABELS.learning },
  { value: "mastered", label: STATUS_LABELS.mastered },
];
