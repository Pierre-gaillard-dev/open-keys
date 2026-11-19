import { newPasswordSchema } from "@open-keys/contracts";
import { PasswordField } from "../../../shared/ui";

export interface NewPassword {
  readonly password: string;
  readonly confirmation: string;
}

/** What is wrong with a new password, checked before sending (same rule as the server). */
export function newPasswordIssues({ password, confirmation }: NewPassword): {
  password?: string;
  confirmation?: string;
} {
  const parsed = newPasswordSchema.safeParse(password);
  if (!parsed.success) {
    return { password: parsed.error.issues[0]?.message ?? "Mot de passe invalide" };
  }
  return password === confirmation ? {} : { confirmation: "Les deux mots de passe diffèrent" };
}

export interface PasswordFieldsProps {
  readonly value: NewPassword;
  readonly errors: { password?: string | undefined; confirmation?: string | undefined };
  readonly onChange: (value: NewPassword) => void;
}

/** New password and its confirmation (a password manager fills both). */
export function PasswordFields({ value, errors, onChange }: PasswordFieldsProps) {
  return (
    <>
      <PasswordField
        label="Nouveau mot de passe"
        autoComplete="new-password"
        hint="10 caractères minimum : une phrase est plus simple à retenir."
        required
        value={value.password}
        error={errors.password}
        onChange={(event) => onChange({ ...value, password: event.target.value })}
      />
      <PasswordField
        label="Confirmer le mot de passe"
        autoComplete="new-password"
        required
        value={value.confirmation}
        error={errors.confirmation}
        onChange={(event) => onChange({ ...value, confirmation: event.target.value })}
      />
    </>
  );
}
