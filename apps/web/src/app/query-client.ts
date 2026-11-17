import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "../shared/api";

const MAX_RETRIES = 2;

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * @param onUnauthorized called when any request answers 401 (session expired or revoked):
 * the app goes back to the login page.
 */
export function createQueryClient(onUnauthorized: () => void = () => undefined): QueryClient {
  const handleError = (error: unknown) => {
    if (isUnauthorized(error)) {
      onUnauthorized();
    }
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) will not fix themselves: only retry network and server failures.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}
