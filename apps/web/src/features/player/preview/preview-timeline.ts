import {
  analyzeMidi,
  buildTimeline,
  parseMidiNotes,
  suggestHandMapping,
  type Timeline,
} from "@open-keys/core";

/** Notes of a MIDI file not imported yet, with the hand mapping the import would propose. */
export function previewTimeline(bytes: Uint8Array): Timeline {
  return buildTimeline(parseMidiNotes(bytes), suggestHandMapping(analyzeMidi(bytes).tracks));
}
