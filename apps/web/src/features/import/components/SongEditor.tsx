import type { SongDetail, ValidationIssue } from "@open-keys/contracts";
import type { TrackHand } from "@open-keys/core";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { ApiError } from "../../../shared/api";
import { Button, ErrorBanner, SectionTitle, SegmentedControl, TextField } from "../../../shared/ui";
import { useSongNotes } from "../api/import.queries";
import { effectiveHands, mappingOf, noteHandsRequest } from "../hands-assignment";
import {
  type DifficultyChoice,
  type SongEditableFields,
  type SongFormValues,
  toEditableFields,
  toFormValues,
} from "../song-form";
import { CoverPicker } from "./CoverPicker";
import { HandsSection } from "./HandsSection";
import { TagsInput } from "./TagsInput";

const DIFFICULTY_OPTIONS: { value: DifficultyChoice; label: string }[] = [
  { value: "none", label: "—" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];

export interface SongEditorProps {
  readonly song: SongDetail;
  readonly submitLabel: string;
  readonly submitting: boolean;
  readonly error: unknown;
  readonly onSubmit: (fields: SongEditableFields, coverSuggestionId: string | null) => void;
  readonly secondaryAction: ReactNode;
}

function issueFor(issues: readonly ValidationIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path || issue.path.startsWith(`${path}.`))?.message;
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

/** Review of an import (UC-04) and later edition of a song (UC-06). */
export function SongEditor({
  song,
  submitLabel,
  submitting,
  error,
  onSubmit,
  secondaryAction,
}: SongEditorProps) {
  const [values, setValues] = useState<SongFormValues>(() => toFormValues(song));
  const [localIssues, setLocalIssues] = useState<readonly ValidationIssue[]>([]);
  const [coverSuggestionId, setCoverSuggestionId] = useState<string | null>(null);
  const issues = localIssues.length > 0 ? localIssues : error instanceof ApiError ? error.issues : [];
  const set = <Key extends keyof SongFormValues>(key: Key, value: SongFormValues[Key]) =>
    setValues((current) => ({ ...current, [key]: value }));

  // Per-note mode (D28): the notes of the file, and the hand each one gets.
  const perNote = values.handsChoice === "auto";
  const notes = useSongNotes(song);
  const mappingFor = (trackHands: Readonly<Record<string, TrackHand>>) =>
    mappingOf(song.tracks, trackHands, "tracks", values.splitPitch);
  const hands = useMemo(
    () =>
      perNote && notes.data
        ? effectiveHands(
            values.assignment,
            song,
            notes.data,
            mappingOf(song.tracks, values.trackHands, "tracks", values.splitPitch),
          )
        : null,
    [perNote, notes.data, values.assignment, values.trackHands, values.splitPitch, song],
  );
  const waitingForNotes = perNote && values.assignment.kind !== "stored" && !hands;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = toEditableFields(
      values,
      noteHandsRequest(values.handsChoice, values.assignment, hands, notes.data),
    );
    setLocalIssues(result.success ? [] : result.issues);
    // The notes are read in a moment: the form is checked meanwhile, sent once they are there.
    if (result.success && !waitingForNotes) {
      onSubmit(result.fields, coverSuggestionId);
    }
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-8 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:gap-10"
    >
      <div className="flex flex-col gap-8">
        <Section title="Répartition des mains">
          <HandsSection
            song={song}
            choice={values.handsChoice}
            splitPitch={values.splitPitch}
            trackHands={values.trackHands}
            assignment={values.assignment}
            notes={notes.data}
            notesError={notes.error}
            hands={hands}
            mappingFor={mappingFor}
            onChoiceChange={(choice) => set("handsChoice", choice)}
            onSplitPitchChange={(pitch) => set("splitPitch", pitch)}
            onTrackHandsChange={(trackHands, assignment) =>
              setValues((current) => ({ ...current, trackHands, assignment }))
            }
            onAssignmentChange={(assignment) => set("assignment", assignment)}
          />
        </Section>
      </div>

      <div className="flex flex-col gap-8">
        <Section title="Couverture">
          <CoverPicker
            song={song}
            title={values.title}
            composer={values.composer}
            selectedSuggestionId={coverSuggestionId}
            onSelectSuggestion={setCoverSuggestionId}
          />
        </Section>

        <Section title="Informations">
          <TextField
            label="Titre"
            required
            value={values.title}
            error={issueFor(issues, "title")}
            onChange={(event) => set("title", event.target.value)}
          />
          <TextField
            label="Compositeur"
            value={values.composer}
            error={issueFor(issues, "composer")}
            onChange={(event) => set("composer", event.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg-soft">Difficulté</span>
            <SegmentedControl<DifficultyChoice>
              label="Difficulté"
              options={DIFFICULTY_OPTIONS}
              value={values.difficulty}
              onChange={(difficulty) => set("difficulty", difficulty)}
            />
          </div>
          <TagsInput tags={values.tags} onChange={(tags) => set("tags", tags)} />
          <TextField
            label="Licence"
            value={values.license}
            placeholder="Public Domain, CC BY-SA 4.0…"
            error={issueFor(issues, "license")}
            onChange={(event) => set("license", event.target.value)}
          />
        </Section>

        {error !== null && error !== undefined && (
          <ErrorBanner error={error} title="Enregistrement impossible" />
        )}
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          {secondaryAction}
          <Button type="submit" variant="primary" size="lg" disabled={submitting}>
            {submitting ? "Enregistrement…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
