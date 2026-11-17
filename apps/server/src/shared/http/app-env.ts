import type { RequestIdVariables } from "hono/request-id";
import type { Logger } from "../logger";

/** Hono environment shared by every route: request id and a logger bound to it. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    logger: Logger;
  };
}
