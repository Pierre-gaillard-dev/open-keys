import { X } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import { addTag } from "../song-form";

export interface TagsInputProps {
  readonly tags: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}

export function TagsInput({ tags, onChange }: TagsInputProps) {
  const inputId = useId();
  const [draft, setDraft] = useState("");

  const commit = () => {
    onChange(addTag(tags, draft));
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-fg-soft">
        Tags
      </label>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 focus-within:border-hand-left">
        {tags.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-lg bg-line py-1 pr-1 pl-2.5 text-sm">
            {tag}
            <button
              type="button"
              aria-label={`Retirer le tag ${tag}`}
              onClick={() => onChange(tags.filter((other) => other !== tag))}
              className="rounded p-0.5 text-fg-muted hover:text-fg"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={tags.length === 0 ? "classique, lent…" : "Ajouter…"}
          className="h-9 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-fg-muted"
        />
      </div>
    </div>
  );
}
