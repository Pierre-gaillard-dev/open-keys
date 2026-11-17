import { type AuthUser, authUserSchema, type LoginRequest } from "@open-keys/contracts";
import { ApiError, apiRequest } from "../../../shared/api";

export function login(credentials: LoginRequest): Promise<AuthUser> {
  return apiRequest("POST", "/auth/login", { body: credentials, schema: authUserSchema });
}

export function logout(): Promise<void> {
  return apiRequest("POST", "/auth/logout");
}

/** Current user, or null when there is no valid session. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiRequest("GET", "/auth/me", { schema: authUserSchema });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
