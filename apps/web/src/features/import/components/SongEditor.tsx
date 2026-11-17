import type { SongDetail, ValidationIssue } from "@open-keys/contracts";
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError } from "../../../shared/api";
import { Button, ErrorBanner, SectionTitle, SegmentedControl, TextField } from "../../../shared/ui";
import {
  type DifficultyChoice,
  type SongEditableFields,
  type SongFormValues,
  toEditableFields,
  toFormValues,
} from "../song-form";
import { CoverPicker } from "./CoverPicker";
import { TagsInput } from "./TagsInput";
import { TrackHandsEditor } from "./TrackHandsEditor";

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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = toEditableFields(values);
    setLocalIssues(result.success ? [] : result.issues);
    if (result.success) {
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
          <TrackHandsEditor
            tracks={song.tracks}
            mode={values.handMode}
            splitPitch={values.splitPitch}
            hands={values.trackHands}
            onModeChange={(mode) => set("handMode", mode)}
            onSplitPitchChange={(pitch) => set("splitPitch", pitch)}
            onHandChange={(trackId, hand) => set("trackHands", { ...values.trackHands, [trackId]: hand })}
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
