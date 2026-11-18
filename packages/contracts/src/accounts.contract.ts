import { z } from "zod";
import { newPasswordSchema, usernameSchema, userRoleSchema } from "./auth.contract";
import { idParamSchema, timestampSchema, ulidSchema } from "./common.contract";

/** An account, as the administration lists it (D29). */
export const userAccountSchema = z.object({
  id: ulidSchema,
  username: z.string(),
  role: userRoleSchema,
  createdAt: timestampSchema,
  disabled: z.boolean(),
});

export type UserAccount = z.infer<typeof userAccountSchema>;

export const updateUserRequestSchema = z.object({ disabled: z.boolean() });

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const userIdParamSchema = idParamSchema;

/**
 * Single-use link made by the admin: `account` creates a new account, `reset` sets a new password
 * for an existing one (forgotten password).
 */
export const INVITATION_KINDS = ["account", "reset"] as const;
export const invitationKindSchema = z.enum(INVITATION_KINDS);

export const invitationSchema = z.object({
  id: ulidSchema,
  kind: invitationKindSchema,
  /** Account whose password is reset (`reset` only). */
  username: z.string().nullable(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
});

export type Invitation = z.infer<typeof invitationSchema>;

/** Without `userId`: an invitation for a new account; with it: a password reset for that account. */
export const createInvitationRequestSchema = z.object({ userId: ulidSchema.optional() });

export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/** The link is only shown once: the server keeps a hash of its token. */
export const createdInvitationSchema = invitationSchema.extend({ path: z.string() });

export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const invitationIdParamSchema = idParamSchema;

export const inviteTokenParamSchema = z.object({ token: z.string().min(20).max(100) });

/** What the person who opens the link sees before choosing a password. */
export const inviteInfoSchema = z.object({
  kind: invitationKindSchema,
  username: z.string().nullable(),
  expiresAt: timestampSchema,
});

export type InviteInfo = z.infer<typeof inviteInfoSchema>;

/** `username` is required for a new account and ignored for a reset. */
export const acceptInvitationRequestSchema = z.object({
  username: usernameSchema.optional(),
  password: newPasswordSchema,
});

export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
