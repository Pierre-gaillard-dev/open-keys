import type { OfflineDb } from "./offline-db";

const STORAGE_KEY = "open-keys:device-user";

function readDeviceUser(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers the account using this device (cleared by a logout). */
export function rememberDeviceUser(userId: string | null): void {
  try {
    if (userId) {
      localStorage.setItem(STORAGE_KEY, userId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private browsing: the cache is cleared at logout anyway.
  }
}

/**
 * Another account logs in on this device (the previous session expired without a logout): what was
 * cached for the previous one is dropped. Returns true when something had to be dropped (D29).
 */
export async function switchDeviceUser(db: OfflineDb, userId: string): Promise<boolean> {
  const previous = readDeviceUser();
  rememberDeviceUser(userId);
  if (previous === null || previous === userId) {
    return false;
  }
  await db.clearCachedData();
  return true;
}
