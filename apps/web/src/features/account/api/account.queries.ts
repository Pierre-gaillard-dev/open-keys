import type { AcceptInvitationRequest } from "@open-keys/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { onLoggedIn } from "../../auth";
import {
  acceptInvite,
  changePassword,
  createInvitation,
  fetchInvitations,
  fetchInvite,
  fetchUsers,
  revokeInvitation,
  setUserDisabled,
} from "./account.api";

/** Administration data (D29): never kept on the device, the root "admin" is not persisted. */
export const adminKeys = {
  users: ["admin", "users"] as const,
  invitations: ["admin", "invitations"] as const,
};

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}

export function useUsers(enabled: boolean) {
  return useQuery({ queryKey: adminKeys.users, queryFn: fetchUsers, enabled });
}

export function useSetUserDisabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => setUserDisabled(id, disabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.users }),
  });
}

export function useInvitations(enabled: boolean) {
  return useQuery({ queryKey: adminKeys.invitations, queryFn: fetchInvitations, enabled });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId?: string) => createInvitation(userId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.invitations }),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKeys.invitations }),
  });
}

export function useInvite(token: string) {
  return useQuery({ queryKey: ["invite", token] as const, queryFn: () => fetchInvite(token), retry: false });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: AcceptInvitationRequest) => acceptInvite(token, request),
    onSuccess: (user) => onLoggedIn(queryClient, user),
  });
}
