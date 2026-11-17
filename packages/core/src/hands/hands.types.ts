export type Hand = "left" | "right";

/** What a track contributes: notes for one hand, or nothing. */
export type TrackHand = Hand | "ignore";

/**
 * - `tracks`: each track is assigned to a hand.
 * - `split`: notes of non-ignored tracks go right when pitch >= splitPitch, left otherwise.
 */
export type HandMode = "tracks" | "split";

export interface HandMapping {
  readonly mode: HandMode;
  readonly splitPitch: number;
  readonly tracks: readonly { readonly trackIndex: number; readonly hand: TrackHand }[];
}
