import { z } from "zod";

export const tagSchema = z.object({
  name: z.string(),
  songCount: z.number().int().nonnegative(),
});

export type Tag = z.infer<typeof tagSchema>;
