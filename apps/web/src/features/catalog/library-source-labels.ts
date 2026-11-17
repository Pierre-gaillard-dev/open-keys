import type { LibrarySource } from "@open-keys/contracts";

/** Online libraries (UC-20), as shown to the user. */
export const LIBRARY_SOURCE_LABELS: Readonly<Record<LibrarySource, string>> = {
  mutopia: "Mutopia Project",
  maestro: "MAESTRO",
  xivmidi: "xivmidi",
};
