import { z } from "zod";
import type { CoverCandidate, CoverProvider, CoverQuery, HttpGet } from "./cover-provider.types";

const API_URL = "https://musicbrainz.org/ws/2";
const COVER_ART_URL = "https://coverartarchive.org/release-group";
const MIN_SCORE = 80;
const MAX_CANDIDATES = 2;
/** Title variants tried in turn, until one finds a cover. */
const MAX_VARIANTS = 3;
/** MusicBrainz API policy: at most one request per second. */
const MIN_INTERVAL_MS = 1000;
/** "Server busy": MusicBrainz sheds load with a 503, a second try usually passes. */
const BUSY_STATUS = 503;

const artistCreditSchema = z.array(z.object({ name: z.string() })).optional();

const releaseGroupSearchSchema = z.object({
  "release-groups": z
    .array(
      z.object({ id: z.string(), title: z.string(), score: z.number(), "artist-credit": artistCreditSchema }),
    )
    .default([]),
});

const recordingSearchSchema = z.object({
  recordings: z
    .array(
      z.object({
        score: z.number(),
        "artist-credit": artistCreditSchema,
        releases: z
          .array(
            z.object({
              status: z.string().optional(),
              "release-group": z.object({
                id: z.string(),
                title: z.string().optional(),
                "primary-type": z.string().nullish(),
                "secondary-types": z.array(z.string()).optional(),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

interface SearchVariant {
  readonly title: string;
  readonly artist?: string | undefined;
}

interface ReleaseGroup {
  readonly id: string;
  readonly title: string;
  readonly artist?: string | undefined;
}

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

function luceneQuery(field: "releasegroup" | "recording", { title, artist }: SearchVariant): string {
  return [`${field}:${quote(title)}`, ...(artist ? [`artist:${quote(artist)}`] : [])].join(" AND ");
}

/** Without "(Piano version)", "[Arr. X]"…: what the arranger added is not in the album's title. */
function cleanTitle(title: string): string {
  return title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Titles of imported files often carry more than the song: "Evanescence - Bring Me to Life",
 * "Time - Inception". The full title is tried first, then its parts.
 */
export function searchVariants({ title, composer }: CoverQuery): SearchVariant[] {
  const artist = composer?.trim() || undefined;
  const clean = cleanTitle(title);
  const parts = clean
    .split(/\s+[-–—|]\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.toLowerCase() !== artist?.toLowerCase());
  const variants: SearchVariant[] = [];
  if (!artist && parts.length >= 2) {
    // "Artist - Song", the usual naming of community files.
    variants.push({ artist: parts[0], title: parts.slice(1).join(" - ") });
  }
  variants.push({ title: parts.length === 1 ? (parts[0] ?? clean) : clean, artist });
  // A lone part is only specific enough with its artist ("Time" by Hans Zimmer).
  if (artist) {
    variants.push(...parts.map((part) => ({ title: part, artist })));
  }
  const seen = new Set<string>();
  return variants
    .filter((variant) => {
      const key = `${variant.title.toLowerCase()}|${variant.artist?.toLowerCase() ?? ""}`;
      const fresh = variant.title.length > 0 && !seen.has(key);
      seen.add(key);
      return fresh;
    })
    .slice(0, MAX_VARIANTS);
}

/**
 * The album of a song that was never a single: the official album or single that most releases
 * of the matching recordings belong to (compilations and live albums left out).
 */
function albumsOfRecordings(response: z.infer<typeof recordingSearchSchema>): ReleaseGroup[] {
  const counts = new Map<string, { group: ReleaseGroup; count: number }>();
  for (const recording of response.recordings.filter((item) => item.score >= MIN_SCORE)) {
    for (const release of recording.releases) {
      const group = release["release-group"];
      const studio =
        release.status === "Official" &&
        (group["primary-type"] === "Album" || group["primary-type"] === "Single") &&
        (group["secondary-types"] ?? []).length === 0;
      if (studio) {
        const entry = counts.get(group.id) ?? {
          group: { id: group.id, title: group.title ?? "", artist: recording["artist-credit"]?.[0]?.name },
          count: 0,
        };
        entry.count++;
        counts.set(group.id, entry);
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((entry) => entry.group);
}

/** Album covers: MusicBrainz finds the release group, the Cover Art Archive serves its front cover. */
export function createMusicBrainzProvider(httpGet: HttpGet, minIntervalMs = MIN_INTERVAL_MS): CoverProvider {
  let nextAllowedAt = 0;
  const throttle = async () => {
    const wait = nextAllowedAt - Date.now();
    nextAllowedAt = Math.max(Date.now(), nextAllowedAt) + minIntervalMs;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  };

  const getJson = async (path: string, signal: AbortSignal): Promise<unknown> => {
    await throttle();
    let response = await httpGet(`${API_URL}${path}`, { signal });
    if (response.status === BUSY_STATUS) {
      await throttle();
      response = await httpGet(`${API_URL}${path}`, { signal });
    }
    if (!response.ok) {
      throw new Error(`MusicBrainz answered ${response.status}`);
    }
    return response.json();
  };

  const releaseGroups = async (variant: SearchVariant, signal: AbortSignal): Promise<ReleaseGroup[]> => {
    const query = encodeURIComponent(luceneQuery("releasegroup", variant));
    const response = releaseGroupSearchSchema.parse(
      await getJson(`/release-group/?query=${query}&fmt=json&limit=5`, signal),
    );
    return response["release-groups"]
      .filter((group) => group.score >= MIN_SCORE)
      .map((group) => ({ id: group.id, title: group.title, artist: group["artist-credit"]?.[0]?.name }));
  };

  const recordingAlbums = async (variant: SearchVariant, signal: AbortSignal): Promise<ReleaseGroup[]> => {
    const query = encodeURIComponent(luceneQuery("recording", variant));
    return albumsOfRecordings(
      recordingSearchSchema.parse(await getJson(`/recording/?query=${query}&fmt=json&limit=25`, signal)),
    );
  };

  const hasFrontCover = async (releaseGroupId: string, signal: AbortSignal) => {
    const response = await httpGet(`${COVER_ART_URL}/${releaseGroupId}/front-250`, {
      signal,
      method: "HEAD",
    });
    return response.ok;
  };

  const withCovers = async (groups: readonly ReleaseGroup[], signal: AbortSignal) => {
    const shortlist = groups.slice(0, MAX_CANDIDATES);
    const covered = await Promise.all(
      shortlist.map(async (group) => ((await hasFrontCover(group.id, signal)) ? group : undefined)),
    );
    return covered
      .filter((group) => group !== undefined)
      .map(
        (group): CoverCandidate => ({
          source: "musicbrainz",
          thumbnailUrl: `${COVER_ART_URL}/${group.id}/front-250`,
          imageUrl: `${COVER_ART_URL}/${group.id}/front-1200`,
          label: [group.title, group.artist].filter(Boolean).join(" — "),
          credit: "Cover Art Archive",
        }),
      );
  };

  return {
    source: "musicbrainz",
    async search(query, signal) {
      for (const variant of searchVariants(query)) {
        // A single or an album of that name, else the album the song is on.
        const direct = await withCovers(await releaseGroups(variant, signal), signal);
        const candidates =
          direct.length > 0 ? direct : await withCovers(await recordingAlbums(variant, signal), signal);
        if (candidates.length > 0) {
          return candidates;
        }
      }
      return [];
    },
  };
}
