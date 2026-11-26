import { useEffect } from "react";
import { createRecordingSync } from "../audio/recording-sync";
import type { PlayerController } from "../controller/player-controller";
import type { PlayerStore } from "../stores/player.store";

/**
 * The original recording of the song (D35), played along with the player when chosen. The file is
 * only downloaded the first time it is chosen (5 to 10 MB: not for every song opened on a phone).
 */
export function useRecording(
  store: PlayerStore,
  controller: PlayerController | null,
  audioUrl: string | null,
) {
  useEffect(() => {
    if (!(controller && audioUrl)) {
      return;
    }
    const element = new Audio();
    element.preload = "auto";
    element.onerror = () => controller.recordingFailed();
    const sync = createRecordingSync(controller.clock, element);
    const apply = (on: boolean) => {
      if (on && !element.src) {
        element.src = audioUrl;
      }
      sync.setEnabled(on);
    };
    apply(store.getState().sound === "recording");
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.sound !== previous.sound) {
        apply(state.sound === "recording");
      }
    });
    return () => {
      unsubscribe();
      sync.dispose();
      element.removeAttribute("src");
      element.load();
    };
  }, [store, controller, audioUrl]);
}
