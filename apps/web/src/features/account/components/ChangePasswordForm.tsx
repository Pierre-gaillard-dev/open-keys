import { type FormEvent, useState } from "react";
import { ApiError } from "../../../shared/api";
import { Button, ErrorBanner, PasswordField } from "../../../shared/ui";
import { useChangePassword } from "../api/account.queries";
import { type NewPassword, newPasswordIssues, PasswordFields } from "./PasswordFields";

const EMPTY: NewPassword = { password: "", confirmation: "" };

/** UC-36: the other devices are logged out, this one stays logged in. */
export function ChangePasswordForm() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState<NewPassword>(EMPTY);
  const [errors, setErrors] = useState<ReturnType<typeof newPasswordIssues>>({});
  const [done, setDone] = useState(false);
  const serverIssue =
    change.error instanceof ApiError
      ? change.error.issues.find((issue) => issue.path === "currentPassword")?.message
      : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const issues = newPasswordIssues(next);
    setErrors(issues);
    setDone(false);
    if (Object.keys(issues).length === 0) {
      change.mutate(
        { currentPassword: current, newPassword: next.password },
        {
          onSuccess: () => {
            setCurrent("");
            setNext(EMPTY);
            setDone(true);
          },
        },
      );
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PasswordField
        label="Mot de passe actuel"
        autoComplete="current-password"
        required
        value={current}
        error={serverIssue}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <PasswordFields value={next} errors={errors} onChange={setNext} />
      {change.error && !serverIssue ? <ErrorBanner error={change.error} /> : null}
      {done && (
        <p role="status" className="text-sm text-fg-soft">
          Mot de passe changé. Les autres appareils sont déconnectés.
        </p>
      )}
      <Button type="submit" variant="primary" className="self-start" disabled={change.isPending}>
        {change.isPending ? "Enregistrement…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
