import { randomBytes } from "node:crypto";
import type {
  AcceptInvitationRequest,
  AuthUser,
  CreatedInvitation,
  Invitation,
  InviteInfo,
  UserAccount,
} from "@open-keys/contracts";
import type { Database } from "../../db";
import { AppError } from "../../shared/http";
import type { Logger } from "../../shared/logger";
import type { Clock, IdGenerator } from "../../shared/runtime";
import { type AuthService, hashToken, type OpenedSession } from "../auth";
import {
  deleteInvitation,
  deleteStaleInvitations,
  findValidInvitation,
  type InvitationRow,
  insertInvitation,
  listPendingInvitations,
  useInvitation,
} from "./accounts.queries";

/** A link left unused for a week expires: it travels by message, it must not live forever. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000;

export interface AccountsServiceDeps {
  readonly db: Database;
  readonly auth: AuthService;
  readonly clock: Clock;
  readonly newId: IdGenerator;
  readonly logger: Logger;
}

export type AccountsService = ReturnType<typeof createAccountsService>;

/** UC-34 to UC-37 (D29): accounts of the circle, by invitation only. */
export function createAccountsService({ db, auth, clock, newId, logger }: AccountsServiceDeps) {
  const toInvitation = (row: InvitationRow): Invitation => ({
    id: row.id,
    kind: row.kind,
    username: row.userId ? (auth.findAccount(row.userId)?.username ?? null) : null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });

  const requireValid = (token: string): InvitationRow => {
    const invitation = findValidInvitation(db, hashToken(token), clock());
    if (!invitation) {
      throw new AppError("NOT_FOUND", "This link is invalid, expired or already used");
    }
    return invitation;
  };

  return {
    listAccounts(): UserAccount[] {
      return auth.listAccounts();
    },

    setDisabled(actor: AuthUser, userId: string, disabled: boolean): UserAccount {
      return auth.setDisabled(actor.id, userId, disabled);
    },

    /** The token is only returned here: the server keeps its hash. */
    createInvitation(actor: AuthUser, userId: string | undefined): CreatedInvitation {
      if (userId !== undefined && !auth.findAccount(userId)) {
        throw new AppError("NOT_FOUND", "Account not found");
      }
      const token = randomBytes(24).toString("base64url");
      const now = clock();
      const row: InvitationRow = {
        id: newId(),
        tokenHash: hashToken(token),
        kind: userId ? "reset" : "account",
        userId: userId ?? null,
        createdBy: actor.id,
        createdAt: now,
        expiresAt: now + INVITATION_TTL_MS,
        usedAt: null,
      };
      insertInvitation(db, row);
      logger.info("Invitation created", { kind: row.kind, invitationId: row.id });
      return { ...toInvitation(row), path: `/invite/${token}` };
    },

    listInvitations(): Invitation[] {
      return listPendingInvitations(db, clock()).map(toInvitation);
    },

    revokeInvitation(id: string): void {
      if (deleteInvitation(db, id) === 0) {
        throw new AppError("NOT_FOUND", "Invitation not found");
      }
    },

    inviteInfo(token: string): InviteInfo {
      return toInvitation(requireValid(token));
    },

    /** Creates the account (or sets the new password), uses the link up, and opens a session. */
    async accept(token: string, request: AcceptInvitationRequest): Promise<OpenedSession> {
      const invitation = requireValid(token);
      if (invitation.kind === "account") {
        if (!request.username) {
          throw new AppError("VALIDATION_ERROR", "A username is required", {
            details: [{ path: "username", message: "Choisis un identifiant" }],
          });
        }
        if (auth.isUsernameTaken(request.username)) {
          throw new AppError("CONFLICT", "This username is taken", {
            details: [{ path: "username", message: "Cet identifiant est déjà pris" }],
          });
        }
      }
      // Used up before the slow password hash: two tabs cannot both use the same link.
      if (!useInvitation(db, invitation.id, clock())) {
        throw new AppError("NOT_FOUND", "This link is invalid, expired or already used");
      }
      if (invitation.kind === "reset" && invitation.userId) {
        return await auth.resetPassword(invitation.userId, request.password);
      }
      return await auth.createAccount(request.username ?? "", request.password);
    },

    purgeStaleInvitations(): number {
      return deleteStaleInvitations(db, clock());
    },
  };
}
