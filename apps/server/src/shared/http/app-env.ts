import type { AuthUser } from "@open-keys/contracts";
import type { RequestIdVariables } from "hono/request-id";
import type { Logger } from "../logger";

/** Hono environment shared by every route: request id and a logger bound to it. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    logger: Logger;
  };
}

/** Environment of routes behind requireAuth: the authenticated user is always set. */
export interface AuthedEnv {
  Variables: AppEnv["Variables"] & {
    user: AuthUser;
    /** Session of the request: kept open when the password changes. */
    sessionId: string;
  };
}
