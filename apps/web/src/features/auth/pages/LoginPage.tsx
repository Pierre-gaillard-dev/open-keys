import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { Button, ErrorBanner, TextField } from "../../../shared/ui";
import { useLogin } from "../api/auth.queries";

export interface LoginPageProps {
  /** Where to go after login (the page that required a session). */
  readonly redirectTo?: string | undefined;
}

export function LoginPage({ redirectTo }: LoginPageProps) {
  const navigate = useNavigate();
  const loginMutation = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    loginMutation.mutate(
      { username, password },
      { onSuccess: () => void navigate({ to: redirectTo?.startsWith("/") ? redirectTo : "/" }) },
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-between px-6 pt-28 pb-10 md:justify-center md:gap-14 md:pt-10">
      <div className="flex flex-col gap-7">
        <div className="flex h-16 items-end gap-1" aria-hidden="true">
          <span className="h-10 w-3.5 rounded bg-hand-left" />
          <span className="h-16 w-3.5 rounded bg-hand-right" />
          <span className="h-7 w-3.5 rounded bg-hand-left" />
          <span className="h-13 w-3.5 rounded bg-hand-right" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-bold tracking-tight">Open Keys</h1>
          <p className="text-fg-muted">Les notes tombent, tu joues.</p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {loginMutation.error && <ErrorBanner error={loginMutation.error} />}
        <TextField
          label="Identifiant"
          name="username"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <TextField
          label="Mot de passe"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" className="mt-2" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </main>
  );
}
