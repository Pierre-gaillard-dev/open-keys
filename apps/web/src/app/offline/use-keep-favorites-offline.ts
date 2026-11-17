import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { songQuery } from "../../features/catalog";
import { libraryQuery } from "../../features/library";
import { loopsQuery } from "../../features/practice";
import { isOnline, midiCache, useIsOnline } from "../../shared/offline";

/**
 * Favorites stay playable offline (UC-14): while online, their details and loops are loaded (kept by
 * the persisted query cache) and their MIDI files stored on the device. Songs opened once are stored
 * by the player itself.
 */
export function useKeepFavoritesOffline(): void {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const library = useQuery(libraryQuery);
  const favoriteIds = (library.data ?? [])
    .filter((entry) => entry.isFavorite)
    .map((entry) => entry.songId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!(online && favoriteIds)) {
      return;
    }
    let cancelled = false;
    const store = async () => {
      for (const id of favoriteIds.split(",")) {
        if (cancelled || !isOnline()) {
          return;
        }
        try {
          const song = await queryClient.fetchQuery(songQuery(id));
          await queryClient.prefetchQuery(loopsQuery(id));
          await midiCache.get(song);
        } catch {
          // Tried again at the next change of favorites or of connectivity.
        }
      }
    };
    void store();
    return () => {
      cancelled = true;
    };
  }, [online, favoriteIds, queryClient]);
}
