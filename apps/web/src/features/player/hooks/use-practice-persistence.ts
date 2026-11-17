import type { LibraryEntry, PutPracticeSessionRequest, SongStatus } from "@open-keys/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { newId } from "../../../shared/lib/ids";
import { type LibraryPatch, saveLibraryPatch } from "../../library";
import { putPracticeSession } from "../../practice";
import type { SessionSnapshot, SessionTracker } from "../practice/session-tracker";
import type { PlayerState, PlayerStore } from "../stores/player.store";

function activeLoopId(state: PlayerState): string | null {
  return state.loopEnabled ? (state.loop?.id ?? null) : null;
}

/** Player settings to resume next time (UC-12); practising a song "to learn" means learning it. */
export function libraryPatchFor(
  state: PlayerState,
  session: SessionSnapshot | null,
  status: SongStatus,
): LibraryPatch {
  return {
    lastPositionMs: state.positionMs,
    lastTempoPct: state.tempoPct,
    handsSettings: state.hands,
    lastLoopId: activeLoopId(state),
    ...(session ? { lastPracticedAt: session.endedAt } : {}),
    ...(session && status === "to_learn" ? { status: "learning" as const } : {}),
  };
}

export function sessionRequestFor(
  songId: string,
  state: PlayerState,
  session: SessionSnapshot,
): PutPracticeSessionRequest {
  return {
    songId,
    loopId: activeLoopId(state),
    mode: "watch",
    ...session,
    accuracy: null,
    score: null,
    updatedAt: Date.now(),
  };
}

/**
 * Saves the practice of this visit (UC-12, UC-15): settings and position in the library, and the
 * session (one id per visit, sent again as it grows: idempotent). Runs on each pause, when the page is
 * hidden and when leaving the player.
 */
export function usePracticePersistence(
  songId: string,
  store: PlayerStore,
  tracker: SessionTracker,
  libraryEntry: LibraryEntry | null,
) {
  const queryClient = useQueryClient();
  const sessionId = useRef(newId());
  const status = useRef<SongStatus>(libraryEntry?.status ?? "to_learn");

  useEffect(() => {
    const save = () => {
      const state = store.getState();
      const session = tracker.snapshot();
      const patch = libraryPatchFor(state, session, status.current);
      if (patch.status) {
        status.current = patch.status;
      }
      if (session) {
        void putPracticeSession(sessionId.current, sessionRequestFor(songId, state, session)).catch(
          () => undefined,
        );
      }
      void saveLibraryPatch(queryClient, songId, patch).catch(() => undefined);
    };

    const unsubscribe = store.subscribe((state, previous) => {
      if (previous.status === "playing" && state.status === "ready") {
        save();
      }
    });
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        save();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onHidden);
      tracker.paused();
      save();
    };
  }, [songId, store, tracker, queryClient]);
}
