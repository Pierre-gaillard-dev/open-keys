export type { Hand, HandMapping, HandMode, TrackHand } from "./hands.types";
export {
  decodeNoteHands,
  type EncodedNoteHands,
  encodeNoteHands,
  HAND_SEPARATION_VERSION,
  type NoteHands,
  notesFingerprint,
  separateNoteHands,
} from "./note-hands";
export {
  DEFAULT_SEPARATION_WEIGHTS,
  type HandNote,
  type SeparationWeights,
  separateHands,
} from "./separate-hands";
export { DEFAULT_SPLIT_PITCH, handForNote, suggestHandMapping } from "./suggest-hand-mapping";
