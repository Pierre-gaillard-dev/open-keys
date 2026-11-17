import { createStore, useStore } from "zustand";

export interface PwaState {
  /** Set when a new version is installed and waiting: activates it and reloads the page. */
  readonly applyUpdate: (() => Promise<void>) | null;
}

export const pwaStore = createStore<PwaState>(() => ({ applyUpdate: null }));

export function useApplyUpdate(): PwaState["applyUpdate"] {
  return useStore(pwaStore, (state) => state.applyUpdate);
}
