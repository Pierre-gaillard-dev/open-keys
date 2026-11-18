import {
  type AcceptInvitationRequest,
  type AuthUser,
  authUserSchema,
  type ChangePasswordRequest,
  type CreatedInvitation,
  createdInvitationSchema,
  type Invitation,
  type InviteInfo,
  invitationSchema,
  inviteInfoSchema,
  type UserAccount,
  userAccountSchema,
} from "@open-keys/contracts";
import { z } from "zod";
import { apiRequest } from "../../../shared/api";

export function changePassword(request: ChangePasswordRequest): Promise<void> {
  return apiRequest("PUT", "/auth/password", { body: request });
}

export function fetchUsers(): Promise<UserAccount[]> {
  return apiRequest("GET", "/users", { schema: z.array(userAccountSchema) });
}

export function setUserDisabled(id: string, disabled: boolean): Promise<UserAccount> {
  return apiRequest("PATCH", `/users/${id}`, { body: { disabled }, schema: userAccountSchema });
}

export function fetchInvitations(): Promise<Invitation[]> {
  return apiRequest("GET", "/invitations", { schema: z.array(invitationSchema) });
}

/** Without `userId`: a new account; with it: a password reset for that account. */
export function createInvitation(userId?: string): Promise<CreatedInvitation> {
  return apiRequest("POST", "/invitations", {
    body: userId ? { userId } : {},
    schema: createdInvitationSchema,
  });
}

export function revokeInvitation(id: string): Promise<void> {
  return apiRequest("DELETE", `/invitations/${id}`);
}

export function fetchInvite(token: string): Promise<InviteInfo> {
  return apiRequest("GET", `/invite/${encodeURIComponent(token)}`, { schema: inviteInfoSchema });
}

export function acceptInvite(token: string, request: AcceptInvitationRequest): Promise<AuthUser> {
  return apiRequest("POST", `/invite/${encodeURIComponent(token)}`, {
    body: request,
    schema: authUserSchema,
  });
}
