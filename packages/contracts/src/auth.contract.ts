import { z } from "zod";
import { ulidSchema } from "./common.contract";

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: ulidSchema,
  username: z.string(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
