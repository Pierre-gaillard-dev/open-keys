import { Link } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { buttonClasses, SectionTitle } from "../../../shared/ui";
import { useCurrentUser } from "../../auth";
import { AccountsAdmin } from "../components/AccountsAdmin";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { NoteNamingSetting } from "../components/NoteNamingSetting";

/** UC-36, the account settings and, for the administrator, UC-34 / UC-37. */
export function AccountPage() {
  const user = useCurrentUser().data;
  if (!user) {
    return null;
  }
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 py-5 md:px-10 md:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">Mon compte</h1>
        <p className="text-fg-muted">
          {user.username} · {user.role === "admin" ? "Administrateur" : "Membre"}
        </p>
      </header>
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <SectionTitle>Noms des notes</SectionTitle>
            <NoteNamingSetting value={user.noteNaming} />
          </section>
          <section className="flex flex-col gap-3">
            <SectionTitle>Mot de passe</SectionTitle>
            <ChangePasswordForm />
          </section>
          <section className="flex flex-col gap-3">
            <SectionTitle>Essais</SectionTitle>
            <Link to="/lab/micro" className={`${buttonClasses("secondary")} self-start`}>
              <Mic aria-hidden="true" className="size-4" /> Labo micro
            </Link>
          </section>
        </div>
        {user.role === "admin" && <AccountsAdmin me={user} />}
      </div>
    </div>
  );
}
