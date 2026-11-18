import { rememberDeviceUser, switchDeviceUser } from "./device-user";
import { MidiCache } from "./midi-cache";
import { OfflineDb, offlineDb } from "./offline-db";
import { Outbox } from "./outbox";

export {
  isOnline,
  reportNetworkFailure,
  startConnectivity,
  useIsOnline,
} from "./connectivity";
export { useOutboxPending } from "./outbox";
export { isPersistedQueryKey, PERSISTED_QUERY_GC_TIME_MS, persistQueryCache } from "./query-persistence";
export { MidiCache, OfflineDb, Outbox, offlineDb };

/** Writes of practice data (UC-15), shared by the features. */
export const outbox = new Outbox(offlineDb);

/** MIDI files available without network (UC-14). */
export const midiCache = new MidiCache(offlineDb);

/** Login of an account (D29): drops what was cached for another one on this device. */
export function switchUser(userId: string): Promise<boolean> {
  return switchDeviceUser(offlineDb, userId);
}

/** Forgets everything stored on the device for the previous session (logout). */
export async function clearOfflineData(): Promise<void> {
  rememberDeviceUser(null);
  await outbox.clear();
  await offlineDb.clearAll();
}
