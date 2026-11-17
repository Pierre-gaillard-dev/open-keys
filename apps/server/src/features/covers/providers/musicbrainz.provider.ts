import { z } from "zod";
import type { CoverCandidate, CoverProvider, CoverQuery, HttpGet } from "./cover-provider.types";

const SEARCH_URL = "https://musicbrainz.org/ws/2/release-group/";
const COVER_ART_URL = "https://coverartarchive.org/release-group";
const MIN_SCORE = 80;
const MAX_CANDIDATES = 2;
/** MusicBrainz API policy: at most one request per second. */
const MIN_INTERVAL_MS = 1000;

const searchResponseSchema = z.object({
  "release-groups": z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        score: z.number(),
        "artist-credit": z.array(z.object({ name: z.string() })).optional(),
      }),
    )
    .default([]),
});

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

function luceneQuery({ title, composer }: CoverQuery): string {
  const parts = [`releasegroup:${quote(title)}`];
  if (composer) {
    parts.push(`artist:${quote(composer)}`);
  }
  return parts.join(" AND ");
}

/** Album covers: MusicBrainz finds the release group, the Cover Art Archive serves its front cover. */
export function createMusicBrainzProvider(httpGet: HttpGet): CoverProvider {
  let nextAllowedAt = 0;
  const throttle = async () => {
    const wait = nextAllowedAt - Date.now();
    nextAllowedAt = Math.max(Date.now(), nextAllowedAt) + MIN_INTERVAL_MS;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  };

  const hasFrontCover = async (releaseGroupId: string, signal: AbortSignal) => {
    const response = await httpGet(`${COVER_ART_URL}/${releaseGroupId}/front-250`, {
      signal,
      method: "HEAD",
    });
    return response.ok;
  };

  return {
    source: "musicbrainz",
    async search(query, signal) {
      await throttle();
      const url = `${SEARCH_URL}?query=${encodeURIComponent(luceneQuery(query))}&fmt=json&limit=5`;
      const response = await httpGet(url, { signal });
      if (!response.ok) {
        return [];
      }
      const groups = searchResponseSchema
        .parse(await response.json())
        ["release-groups"].filter((group) => group.score >= MIN_SCORE)
        .slice(0, MAX_CANDIDATES);
      const withCovers = await Promise.all(
        groups.map(async (group) => ((await hasFrontCover(group.id, signal)) ? group : undefined)),
      );
      return withCovers
        .filter((group) => group !== undefined)
        .map(
          (group): CoverCandidate => ({
            source: "musicbrainz",
            thumbnailUrl: `${COVER_ART_URL}/${group.id}/front-250`,
            imageUrl: `${COVER_ART_URL}/${group.id}/front-1200`,
            label: [group.title, group["artist-credit"]?.[0]?.name].filter(Boolean).join(" — "),
            credit: "Cover Art Archive",
          }),
        );
    },
  };
}
