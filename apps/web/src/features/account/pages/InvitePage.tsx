import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ApiError } from "../../../shared/api";
import { Button, ErrorBanner, TextField } from "../../../shared/ui";
import { useAcceptInvite, useInvite } from "../api/account.queries";
import { type NewPassword, newPasswordIssues, PasswordFields } from "../components/PasswordFields";

/** UC-35: the link received opens this page, without session: a new account or a new password. */
export function InvitePage({ token }: { readonly token: string }) {
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState<NewPassword>({ password: "", confirmation: "" });
  const [errors, setErrors] = useState<ReturnType<typeof newPasswordIssues>>({});
  const isReset = invite.data?.kind === "reset";
  const usernameIssue =
    accept.error instanceof ApiError
      ? accept.error.issues.find((issue) => issue.path === "username")?.message
      : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const issues = newPasswordIssues(password);
    setErrors(issues);
    if (Object.keys(issues).length === 0) {
      accept.mutate(
        { ...(isReset ? {} : { username: username.trim() }), password: password.password },
        { onSuccess: () => void navigate({ to: "/" }) },
      );
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {invite.data ? (isReset ? "Nouveau mot de passe" : "Bienvenue sur Open Keys") : "Open Keys"}
        </h1>
        {invite.data && (
          <p className="text-fg-muted">
            {isReset
              ? `Choisis un nouveau mot de passe pour ${invite.data.username ?? "ton compte"}.`
              : "Choisis ton identifiant et ton mot de passe pour créer ton compte."}
          </p>
        )}
      </div>
      {invite.error ? (
        <ErrorBanner
          error={null}
          title="Ce lien n'est plus valable : il a expiré ou a déjà servi. Demande-en un nouveau."
        />
      ) : null}
      {invite.data && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {!isReset && (
            <TextField
              label="Identifiant"
              autoComplete="username"
              required
              value={username}
              error={usernameIssue}
              onChange={(event) => setUsername(event.target.value)}
            />
          )}
          <PasswordFields value={password} errors={errors} onChange={setPassword} />
          {accept.error && !usernameIssue ? <ErrorBanner error={accept.error} /> : null}
          <Button type="submit" variant="primary" size="lg" disabled={accept.isPending}>
            {isReset ? "Enregistrer et se connecter" : "Créer mon compte"}
          </Button>
        </form>
      )}
    </main>
  );
}
