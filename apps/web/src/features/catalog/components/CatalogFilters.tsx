import { SONG_SORTS } from "@open-keys/contracts";
import { Chip } from "../../../shared/ui";
import { useTags } from "../api/catalog.queries";
import { CATALOG_VIEW_LABELS, CATALOG_VIEWS, type CatalogSearch } from "../catalog-search";

const SORT_LABELS: Readonly<Record<(typeof SONG_SORTS)[number], string>> = {
  created: "Ajout récent",
  title: "Titre",
  practiced: "Dernière pratique",
};

export interface CatalogFiltersProps {
  readonly search: CatalogSearch;
  readonly onChange: (search: CatalogSearch) => void;
}

export function CatalogFilters({ search, onChange }: CatalogFiltersProps) {
  const tags = useTags();
  const selectedTags = search.tags ?? [];
  const toggleTag = (name: string) => {
    const next = selectedTags.includes(name)
      ? selectedTags.filter((tag) => tag !== name)
      : [...selectedTags, name];
    onChange({ ...search, tags: next.length > 0 ? next : undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {CATALOG_VIEWS.map((view) => (
          <Chip
            key={view}
            selected={(search.view ?? "all") === view}
            onClick={() => onChange({ ...search, view: view === "all" ? undefined : view })}
          >
            {CATALOG_VIEW_LABELS[view]}
          </Chip>
        ))}
        <label className="ml-auto hidden items-center gap-2 text-sm text-fg-muted md:flex">
          Tri
          <select
            value={search.sort ?? "created"}
            onChange={(event) => {
              const sort = SONG_SORTS.find((value) => value === event.target.value);
              onChange({ ...search, sort: sort === "created" ? undefined : sort });
            }}
            className="h-9 rounded-xl border border-line bg-surface px-2 text-fg-soft"
          >
            {SONG_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tags.data && tags.data.length > 0 && (
        <fieldset className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <legend className="sr-only">Tags</legend>
          {tags.data.map((tag) => (
            <Chip
              key={tag.name}
              selected={selectedTags.includes(tag.name)}
              onClick={() => toggleTag(tag.name)}
              className="h-8 text-xs"
            >
              #{tag.name}
            </Chip>
          ))}
        </fieldset>
      )}
    </div>
  );
}
