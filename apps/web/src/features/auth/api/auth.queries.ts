import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearOfflineData } from "../../../shared/offline";
import { fetchCurrentUser, login, logout } from "./auth.api";

export const currentUserQuery = queryOptions({
  queryKey: ["auth", "me"] as const,
  queryFn: fetchCurrentUser,
  staleTime: 5 * 60_000,
});

export function useCurrentUser() {
  return useQuery(currentUserQuery);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(currentUserQuery.queryKey, user),
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
