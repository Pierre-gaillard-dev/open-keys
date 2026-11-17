import type { Tag } from "@open-keys/contracts";
import type { Database, Executor } from "../../db";
import type { IdGenerator } from "../../shared/runtime";
import {
  deleteUnusedTags,
  findTagIdsByName,
  insertTags,
  listTagsWithCounts,
  replaceSongTagLinks,
  tagNamesBySong,
} from "./tags.queries";

export type TagsService = ReturnType<typeof createTagsService>;

function normalize(names: readonly string[]): string[] {
  return [...new Set(names.map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0))];
}

export function createTagsService(db: Database, newId: IdGenerator) {
  return {
    /** Sets the tags of a song, creating unknown tags. Call inside the caller's transaction. */
    replaceSongTags(tx: Executor, songId: string, names: readonly string[]): void {
      const wanted = normalize(names);
      const existing = findTagIdsByName(tx, wanted);
      const created = wanted.filter((name) => !existing.has(name)).map((name) => ({ id: newId(), name }));
      insertTags(tx, created);
      const ids = [...existing.values(), ...created.map((tag) => tag.id)];
      replaceSongTagLinks(tx, songId, ids);
    },

    tagsBySong(songIds: readonly string[]): Map<string, string[]> {
      return tagNamesBySong(db, songIds);
    },

    list(): Tag[] {
      return listTagsWithCounts(db);
    },

    purgeUnused(): number {
      return deleteUnusedTags(db);
    },
  };
}
