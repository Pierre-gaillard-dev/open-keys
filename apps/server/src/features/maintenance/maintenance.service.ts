import type { Database } from "../../db";
import type { Logger } from "../../shared/logger";
import type { Clock } from "../../shared/runtime";
import type { FileKind, FileStorage } from "../../shared/storage";
import type { AccountsService } from "../accounts";
import type { AuthService } from "../auth";
import type { TagsService } from "../tags";
import {
  deleteSongs,
  findAbandonedDraftIds,
  findExpiredDeletedSongIds,
  referencedFiles,
} from "./maintenance.queries";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** UC-04: an import not confirmed within 24 h is dropped. */
export const DRAFT_RETENTION_MS = DAY_MS;
/** UC-07: a deleted song (and its practice data) is kept 30 days. */
export const DELETED_SONG_RETENTION_MS = 30 * DAY_MS;
/** A file younger than this may belong to an import in progress. */
export const ORPHAN_FILE_GRACE_MS = HOUR_MS;

export interface MaintenanceServiceDeps {
  readonly db: Database;
  readonly storage: FileStorage;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly auth: AuthService;
  readonly accounts: AccountsService;
  readonly tags: TagsService;
}

export interface MaintenanceReport {
  readonly drafts: number;
  readonly deletedSongs: number;
  readonly sessions: number;
  readonly invitations: number;
  readonly tags: number;
  readonly files: number;
}

export type MaintenanceService = ReturnType<typeof createMaintenanceService>;

export function createMaintenanceService(deps: MaintenanceServiceDeps) {
  const { db, storage, clock, logger, auth, accounts, tags } = deps;
  const purgeOrphanFiles = async (): Promise<number> => {
    const referenced = referencedFiles(db);
    const keep: Record<FileKind, Set<string>> = { midi: referenced.midi, cover: referenced.covers };
    const cutoff = clock() - ORPHAN_FILE_GRACE_MS;
    let removed = 0;
    for (const kind of ["midi", "cover"] as const) {
      for (const file of await storage.list(kind)) {
        if (!keep[kind].has(file.sha256) && file.modifiedAt < cutoff) {
          await storage.remove(kind, file.sha256);
          removed++;
        }
      }
    }
    return removed;
  };

  return {
    async run(): Promise<MaintenanceReport> {
      const now = clock();
      const drafts = deleteSongs(db, findAbandonedDraftIds(db, now - DRAFT_RETENTION_MS));
      const deletedSongs = deleteSongs(db, findExpiredDeletedSongIds(db, now - DELETED_SONG_RETENTION_MS));
      const report: MaintenanceReport = {
        drafts,
        deletedSongs,
        sessions: auth.purgeExpiredSessions(),
        invitations: accounts.purgeStaleInvitations(),
        tags: tags.purgeUnused(),
        files: await purgeOrphanFiles(),
      };
      const total = Object.values(report).reduce((sum, value) => sum + value, 0);
      if (total > 0) {
        logger.info("Maintenance purge", { ...report });
      }
      return report;
    },
  };
}
