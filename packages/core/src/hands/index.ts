export type { Hand, HandMapping, HandMode, TrackHand } from "./hands.types";
export {
  DEFAULT_SEPARATION_WEIGHTS,
  type HandNote,
  type SeparationWeights,
  separateHands,
} from "./separate-hands";
export { DEFAULT_SPLIT_PITCH, handForNote, suggestHandMapping } from "./suggest-hand-mapping";
