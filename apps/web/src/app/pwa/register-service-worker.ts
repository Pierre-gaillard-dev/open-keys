import { registerSW } from "virtual:pwa-register";
import { pwaStore } from "./pwa.store";

/** The app may stay open for hours (practice, phone on a tripod): look for a new version regularly. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000;

/**
 * Registers the Service Worker (app shell and piano samples cached). A new version waits until the user
 * accepts it (UpdateBanner): a reload must never interrupt practice.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const updateServiceWorker = registerSW({
    onNeedRefresh: () => pwaStore.setState({ applyUpdate: () => updateServiceWorker(true) }),
    onRegisteredSW: (_url, registration) => {
      if (registration) {
        setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_INTERVAL_MS);
      }
    },
  });
}
