import { z } from "zod";
import { ulidSchema } from "./common.contract";

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const USER_ROLES = ["admin", "member"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Rules for a new username: what the login form accepts, without spaces. */
export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[\p{L}\p{N}._-]+$/u, "Lettres, chiffres, point, tiret et tiret bas uniquement");

/** A new password (accounts and changes): long rather than complicated. */
export const newPasswordSchema = z.string().min(10, "10 caractères minimum").max(256);

export const authUserSchema = z.object({
  id: ulidSchema,
  username: z.string(),
  role: userRoleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: newPasswordSchema,
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
