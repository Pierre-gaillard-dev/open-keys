import type { AuthUser } from "@open-keys/contracts";
import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearOfflineData, switchUser } from "../../../shared/offline";
import { fetchCurrentUser, login, logout } from "./auth.api";

export const currentUserQuery = queryOptions({
  queryKey: ["auth", "me"] as const,
  queryFn: fetchCurrentUser,
  staleTime: 5 * 60_000,
});

export function useCurrentUser() {
  return useQuery(currentUserQuery);
}

/**
 * An account is now logged in (login form, invitation link). If another one used this device, what
 * was cached for it is dropped first (D29).
 */
export async function onLoggedIn(queryClient: QueryClient, user: AuthUser): Promise<void> {
  if (await switchUser(user.id)) {
    queryClient.clear();
  }
  queryClient.setQueryData(currentUserQuery.queryKey, user);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => onLoggedIn(queryClient, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: async () => {
      // Nothing of the previous session may stay in memory nor on the device.
      queryClient.clear();
      queryClient.setQueryData(currentUserQuery.queryKey, null);
      await clearOfflineData();
    },
  });
}
