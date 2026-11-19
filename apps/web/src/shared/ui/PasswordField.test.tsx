import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PasswordField } from "./PasswordField";

describe("PasswordField", () => {
  it("shows and hides what was typed", async () => {
    render(<PasswordField label="Mot de passe" defaultValue="secret" />);
    const input = screen.getByLabelText("Mot de passe") as HTMLInputElement;
    expect(input.type).toBe("password");

    await userEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("secret");

    await userEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(input.type).toBe("password");
  });
});
