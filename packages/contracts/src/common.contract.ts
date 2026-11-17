import { isUlid } from "@open-keys/core";
import { z } from "zod";

export const ulidSchema = z.string().refine(isUlid, "Invalid id");

/** Milliseconds since epoch (UTC). */
export const timestampSchema = z.number().int().nonnegative();

/** Playback speed in percent of the original tempo. */
export const tempoPctSchema = z.number().int().min(25).max(100);

export const difficultySchema = z.number().int().min(1).max(5);

/** Piano range: A0 (21) to C8 (108). */
export const pianoPitchSchema = z.number().int().min(21).max(108);

/** Comma-separated query parameter ("a,b,c") parsed as a list. */
export const csvSchema = z.string().transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0),
);
