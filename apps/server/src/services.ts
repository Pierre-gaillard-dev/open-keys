import type { Env } from "./config/env";
import type { Database } from "./db";
import { createAccountsService } from "./features/accounts";
import {
  createAuthService,
  createLoginRateLimiter,
  type PasswordHasher,
  type RateLimitPolicy,
} from "./features/auth";
import { type CoverProvider, createCoversService } from "./features/covers";
import { createImportsService } from "./features/imports";
import { createLibraryService } from "./features/library";
import { createMaintenanceService } from "./features/maintenance";
import { createPracticeService } from "./features/practice";
import { createSongsService } from "./features/songs";
import { createSourcesService, type SourceProvider } from "./features/sources";
import { createTagsService } from "./features/tags";
import { createTranscriptionsService, type TranscriberClient } from "./features/transcriptions";
import type { SafeFetch } from "./shared/http";
import type { Logger } from "./shared/logger";
import type { Clock, IdGenerator } from "./shared/runtime";
import type { FileStorage } from "./shared/storage";

/** Everything with side effects, injected so tests can replace it (in-memory DB, fake network, fixed clock). */
export interface Infrastructure {
  readonly env: Env;
  readonly logger: Logger;
  readonly db: Database;
  readonly storage: FileStorage;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly safeFetch: SafeFetch;
  readonly hasher: PasswordHasher;
  readonly coverProviders: readonly CoverProvider[];
  /** Online libraries (UC-20); they download MIDI files through the imports service. */
  readonly sourceProviders: (deps: {
    readonly download: (url: string) => Promise<Uint8Array>;
  }) => readonly SourceProvider[];
  readonly loginPolicy?: RateLimitPolicy;
  /** The transcriber service (D34), or null when the server has none. */
  readonly transcriber: TranscriberClient | null;
}

export type Services = ReturnType<typeof createServices>;

/** Composition root: wires every feature service. */
export function createServices(infra: Infrastructure) {
  const { env, logger, db, storage, clock, newId, safeFetch, hasher, coverProviders } = infra;

  const auth = createAuthService({
    db,
    clock,
    newId,
    hasher,
    rateLimiter: createLoginRateLimiter(clock, infra.loginPolicy),
    logger,
  });
  const accounts = createAccountsService({ db, auth, clock, newId, logger });
  const tags = createTagsService(db, newId);
  const songs = createSongsService({ db, clock, storage, tags });
  const covers = createCoversService({
    songs,
    storage,
    safeFetch,
    providers: coverProviders,
    clock,
    newId,
    logger,
    maxCoverSize: env.MAX_COVER_SIZE,
  });
  const imports = createImportsService({
    songs,
    covers,
    storage,
    safeFetch,
    clock,
    newId,
    logger,
    maxMidiSize: env.MAX_MIDI_SIZE,
  });
  const practice = createPracticeService({ db, clock, songs });
  const library = createLibraryService({ db, songs, practice });
  const maintenance = createMaintenanceService({ db, storage, clock, logger, auth, accounts, tags });
  const sources = createSourcesService({
    db,
    providers: infra.sourceProviders({ download: imports.downloadMidi }),
    imports,
    clock,
    logger,
  });

  const transcriptions = createTranscriptionsService({
    db,
    storage,
    imports,
    auth,
    transcriber: infra.transcriber,
    clock,
    newId,
    logger,
    maxAudioSize: env.MAX_AUDIO_SIZE,
  });

  return {
    auth,
    accounts,
    tags,
    songs,
    covers,
    imports,
    practice,
    library,
    maintenance,
    sources,
    transcriptions,
  };
}
