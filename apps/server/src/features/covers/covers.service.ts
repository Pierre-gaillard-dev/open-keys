import type { AuthUser, CoverSuggestion } from "@open-keys/contracts";
import { AppError, type SafeFetch } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import type { FileStorage } from "../../shared/storage";
import type { SongCover, SongsService } from "../songs";
import { processCoverImage } from "./image-processor";
import type { CoverCandidate, CoverProvider, CoverQuery } from "./providers/cover-provider.types";

const SUGGESTION_TTL_MS = 60 * 60_000;
/** MusicBrainz is throttled to 1 request/s and may try several titles: a few seconds each. */
const PROVIDER_TIMEOUT_MS = 15_000;

export interface CoversServiceDeps {
  readonly songs: SongsService;
  readonly storage: FileStorage;
  readonly safeFetch: SafeFetch;
  readonly providers: readonly CoverProvider[];
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly logger: Logger;
  readonly maxCoverSize: number;
}

export type CoversService = ReturnType<typeof createCoversService>;

export function createCoversService(deps: CoversServiceDeps) {
  const { songs, storage, safeFetch, providers, clock, newId, logger, maxCoverSize } = deps;
  /** Suggestions are only referenced by id: the client never decides which URL the server downloads. */
  const suggestions = new Map<string, { candidate: CoverCandidate; expiresAt: number }>();

  const forgetExpired = () => {
    const now = clock();
    for (const [id, entry] of suggestions) {
      if (entry.expiresAt <= now) {
        suggestions.delete(id);
      }
    }
  };

  const store = async (songId: string, image: Uint8Array, cover: Omit<SongCover, "sha256">) => {
    songs.requireSong(songId);
    const webp = await processCoverImage(image);
    const { sha256 } = await storage.put("cover", webp);
    songs.setCover(songId, { ...cover, sha256 });
  };

  const download = (url: string) =>
    safeFetch(url, { maxBytes: maxCoverSize, accept: "image/*", timeoutMs: 15_000 }).then(
      (result) => result.bytes,
    );

  const searchProvider = async (provider: CoverProvider, query: CoverQuery): Promise<CoverCandidate[]> => {
    try {
      return await provider.search(query, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
    } catch (error) {
      logger.warn("Cover provider failed", { provider: provider.source, error });
      return [];
    }
  };

  return {
    async suggest(query: CoverQuery): Promise<CoverSuggestion[]> {
      forgetExpired();
      const results = await Promise.all(providers.map((provider) => searchProvider(provider, query)));
      return results.flat().map((candidate) => {
        const id = newId();
        suggestions.set(id, { candidate, expiresAt: clock() + SUGGESTION_TTL_MS });
        return {
          id,
          source: candidate.source,
          thumbnailUrl: candidate.thumbnailUrl,
          label: candidate.label,
          credit: candidate.credit,
        };
      });
    },

    async applySuggestion(actor: AuthUser, songId: string, suggestionId: string): Promise<void> {
      songs.requireEditable(actor, songId);
      forgetExpired();
      const entry = suggestions.get(suggestionId);
      if (!entry) {
        throw new AppError("NOT_FOUND", "Cover suggestion not found or expired, search again");
      }
      const { candidate } = entry;
      // The large rendition may not exist for small originals: fall back to the thumbnail.
      const image = await download(candidate.imageUrl).catch(() => download(candidate.thumbnailUrl));
      await store(songId, image, { source: candidate.source, credit: candidate.credit });
    },

    async setFromUrl(actor: AuthUser, songId: string, url: string): Promise<void> {
      songs.requireEditable(actor, songId);
      await store(songId, await download(url), { source: "url", credit: null });
    },

    async setFromUpload(actor: AuthUser, songId: string, image: Uint8Array): Promise<void> {
      songs.requireEditable(actor, songId);
      if (image.byteLength > maxCoverSize) {
        throw new AppError("PAYLOAD_TOO_LARGE", `Images are limited to ${maxCoverSize} bytes`);
      }
      await store(songId, image, { source: "upload", credit: null });
    },

    remove(actor: AuthUser, songId: string): void {
      songs.requireEditable(actor, songId);
      songs.setCover(songId, null);
    },

    async read(songId: string): Promise<{ bytes: Uint8Array; sha256: string }> {
      const sha256 = songs.requireSong(songId).coverSha256;
      const bytes = sha256 ? await storage.read("cover", sha256) : undefined;
      if (!(sha256 && bytes)) {
        throw new AppError("NOT_FOUND", "This song has no cover");
      }
      return { bytes, sha256 };
    },
  };
}
