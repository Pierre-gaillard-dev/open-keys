import { registerSW } from "virtual:pwa-register";
import { currentHref, pwaStore } from "./pwa.store";

/** The app may stay open for hours (practice, phone on a tripod): look for a new version regularly. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000;

/**
 * Registers the Service Worker (app shell and piano samples cached). A new version waits, then is applied
 * by the app shell when that interrupts nothing (use-auto-update): never during practice.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  const updateServiceWorker = registerSW({
    onNeedRefresh: () =>
      pwaStore.setState({ update: { apply: () => updateServiceWorker(true), href: currentHref() } }),
    onRegisteredSW: (_url, registration) => {
      if (registration) {
        setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_INTERVAL_MS);
      }
    },
  });
}
