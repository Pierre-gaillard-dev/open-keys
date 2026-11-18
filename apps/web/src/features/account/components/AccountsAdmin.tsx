import type { AuthUser, CreatedInvitation } from "@open-keys/contracts";
import { KeyRound, Link2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button, ErrorBanner, SectionTitle } from "../../../shared/ui";
import {
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
  useSetUserDisabled,
  useUsers,
} from "../api/account.queries";
import { InvitationLink } from "./InvitationLink";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** UC-34 and UC-37: the accounts of the circle and the pending links (administrator only). */
export function AccountsAdmin({ me }: { readonly me: AuthUser }) {
  const users = useUsers(true);
  const invitations = useInvitations(true);
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const setDisabled = useSetUserDisabled();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const makeLink = (userId?: string) => create.mutate(userId, { onSuccess: setCreated });
  const error = users.error ?? invitations.error ?? create.error ?? revoke.error ?? setDisabled.error;

  return (
    <div className="flex flex-col gap-8">
      {error ? <ErrorBanner error={error} /> : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Comptes</SectionTitle>
          <Button variant="primary" onClick={() => makeLink()} disabled={create.isPending}>
            <UserPlus aria-hidden="true" className="size-4" />
            Inviter quelqu'un
          </Button>
        </div>
        {created && <InvitationLink invitation={created} />}
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {users.data?.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">
                  {user.username}
                  {user.id === me.id && <span className="font-normal text-fg-muted"> (toi)</span>}
                </span>
                <span className="text-xs text-fg-muted">
                  {user.role === "admin" ? "Administrateur" : "Membre"} · depuis le{" "}
                  {dateFormat.format(user.createdAt)}
                  {user.disabled && " · désactivé"}
                </span>
              </div>
              {user.id !== me.id && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => makeLink(user.id)}
                    disabled={create.isPending || user.disabled}
                    aria-label={`Lien de nouveau mot de passe pour ${user.username}`}
                  >
                    <KeyRound aria-hidden="true" className="size-4" />
                    <span className="hidden sm:inline">Mot de passe oublié</span>
                  </Button>
                  <Button
                    variant={user.disabled ? "secondary" : "danger"}
                    disabled={setDisabled.isPending}
                    onClick={() => setDisabled.mutate({ id: user.id, disabled: !user.disabled })}
                  >
                    {user.disabled ? "Réactiver" : "Désactiver"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Liens en attente</SectionTitle>
        {invitations.data && invitations.data.length === 0 ? (
          <p className="text-sm text-fg-muted">Aucun lien en attente.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {invitations.data?.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
                <Link2 aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">
                    {invitation.kind === "account"
                      ? "Invitation"
                      : `Nouveau mot de passe pour ${invitation.username ?? "?"}`}
                  </span>
                  <span className="text-xs text-fg-muted">
                    Expire le {dateFormat.format(invitation.expiresAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(invitation.id)}
                >
                  Révoquer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
