import type { Tag } from "@open-keys/contracts";
import { Hono } from "hono";
import type { AuthedEnv } from "../../shared/http";
import type { TagsService } from "./tags.service";

export function createTagsRoutes(service: TagsService) {
  return new Hono<AuthedEnv>().get("/", (c) => c.json<Tag[]>(service.list()));
}
