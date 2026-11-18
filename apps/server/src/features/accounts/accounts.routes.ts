import {
  type AuthUser,
  acceptInvitationRequestSchema,
  type CreatedInvitation,
  createInvitationRequestSchema,
  type Invitation,
  type InviteInfo,
  invitationIdParamSchema,
  inviteTokenParamSchema,
  type UserAccount,
  updateUserRequestSchema,
  userIdParamSchema,
} from "@open-keys/contracts";
import { Hono } from "hono";
import { type AppEnv, type AuthedEnv, validate } from "../../shared/http";
import { requireAdmin, writeSessionCookie } from "../auth";
import type { AccountsService } from "./accounts.service";

/** Mounted under /users, behind requireAuth: the administrator only (UC-37). */
export function createUsersRoutes(service: AccountsService) {
  return new Hono<AuthedEnv>()
    .use(requireAdmin)
    .get("/", (c) => c.json<UserAccount[]>(service.listAccounts()))
    .patch("/:id", validate("param", userIdParamSchema), validate("json", updateUserRequestSchema), (c) =>
      c.json<UserAccount>(
        service.setDisabled(c.var.user, c.req.valid("param").id, c.req.valid("json").disabled),
      ),
    );
}

/** Mounted under /invitations, behind requireAuth: the administrator only (UC-34). */
export function createInvitationsRoutes(service: AccountsService) {
  return new Hono<AuthedEnv>()
    .use(requireAdmin)
    .get("/", (c) => c.json<Invitation[]>(service.listInvitations()))
    .post("/", validate("json", createInvitationRequestSchema), (c) =>
      c.json<CreatedInvitation>(service.createInvitation(c.var.user, c.req.valid("json").userId), 201),
    )
    .delete("/:id", validate("param", invitationIdParamSchema), (c) => {
      service.revokeInvitation(c.req.valid("param").id);
      return c.body(null, 204);
    });
}

/** Mounted under /invite, without session: opening the link received (UC-35). */
export function createInviteRoutes(service: AccountsService, secureCookie: boolean) {
  return new Hono<AppEnv>()
    .get("/:token", validate("param", inviteTokenParamSchema), (c) =>
      c.json<InviteInfo>(service.inviteInfo(c.req.valid("param").token)),
    )
    .post(
      "/:token",
      validate("param", inviteTokenParamSchema),
      validate("json", acceptInvitationRequestSchema),
      async (c) => {
        const session = await service.accept(c.req.valid("param").token, c.req.valid("json"));
        writeSessionCookie(c, session.token, session.expiresAt, secureCookie);
        return c.json<AuthUser>(session.user, 201);
      },
    );
}
