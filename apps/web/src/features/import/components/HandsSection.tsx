import type { SongDetail } from "@open-keys/contracts";
import type { NoteHands, ParsedNote, TrackHand } from "@open-keys/core";
import { RotateCcw } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button, ErrorBanner } from "../../../shared/ui";
import { type Assignment, type HandsChoice, withHand, withPlayedTracks } from "../hands-assignment";
import { NoteHandsRoll } from "./NoteHandsRoll";
import { TrackHandsEditor } from "./TrackHandsEditor";

/** Corrections need a mouse and room: on PC only (the roll is shown everywhere). */
const EDITOR_MEDIA = "(min-width: 768px) and (pointer: fine)";

const mediaQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia(EDITOR_MEDIA) : null);

function useCanEditNotes(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = mediaQuery();
      query?.addEventListener("change", onChange);
      return () => query?.removeEventListener("change", onChange);
    },
    () => mediaQuery()?.matches ?? false,
  );
}

export interface HandsSectionProps {
  readonly song: SongDetail;
  readonly choice: HandsChoice;
  readonly splitPitch: number;
  readonly trackHands: Readonly<Record<string, TrackHand>>;
  readonly assignment: Assignment;
  /** Notes of the file (loading: undefined) and the hand of each one in the per-note mode. */
  readonly notes: readonly ParsedNote[] | undefined;
  readonly notesError: unknown;
  readonly hands: NoteHands | null;
  readonly mappingFor: (
    trackHands: Readonly<Record<string, TrackHand>>,
  ) => Parameters<typeof withPlayedTracks>[3];
  readonly onChoiceChange: (choice: HandsChoice) => void;
  readonly onSplitPitchChange: (pitch: number) => void;
  readonly onTrackHandsChange: (
    trackHands: Readonly<Record<string, TrackHand>>,
    assignment: Assignment,
  ) => void;
  readonly onAssignmentChange: (assignment: Assignment) => void;
}

/** "Répartition des mains" of the song editor (UC-04, D28). */
export function HandsSection(props: HandsSectionProps) {
  const { song, choice, assignment, notes, hands } = props;
  const canEdit = useCanEditNotes();

  const changeTrack = (trackId: string, hand: TrackHand) => {
    const trackHands = { ...props.trackHands, [trackId]: hand };
    const next =
      choice === "auto" && notes && hands
        ? withPlayedTracks(assignment, hands, notes, props.mappingFor(trackHands), song)
        : assignment;
    props.onTrackHandsChange(trackHands, next);
  };

  return (
    <div className="flex flex-col gap-4">
      <TrackHandsEditor
        tracks={song.tracks}
        mode={choice}
        splitPitch={props.splitPitch}
        hands={props.trackHands}
        onModeChange={props.onChoiceChange}
        onSplitPitchChange={props.onSplitPitchChange}
        onHandChange={changeTrack}
      />
      {choice === "auto" && (
        <div className="flex flex-col gap-3">
          {props.notesError ? <ErrorBanner error={props.notesError} title="Notes illisibles" /> : null}
          {!((notes && hands) || props.notesError) && (
            <p role="status" className="text-sm text-fg-muted">
              Répartition des notes…
            </p>
          )}
          {notes && hands && (
            <NoteHandsRoll
              notes={notes}
              hands={hands}
              editable={canEdit}
              onAssign={(indexes, hand) => props.onAssignmentChange(withHand(hands, indexes, hand))}
            />
          )}
          {assignment.kind !== "auto" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-auto text-xs text-fg-muted">
                {assignment.kind === "edited" && assignment.source === "edited"
                  ? "Répartition corrigée à la main."
                  : "Répartition enregistrée avec le morceau."}
              </p>
              <Button onClick={() => props.onAssignmentChange({ kind: "auto" })}>
                <RotateCcw aria-hidden="true" className="size-4" />
                Recalculer automatiquement
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
