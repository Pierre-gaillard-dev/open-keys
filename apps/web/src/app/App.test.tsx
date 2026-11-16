import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Open Keys" })).toBeDefined();
  });

  it("uses the core package to name middle C", () => {
    render(<App />);

    expect(screen.getByText("Do central : C4")).toBeDefined();
  });
});
