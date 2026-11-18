import { expect, type Page, test } from "@playwright/test";
import { importSong, login } from "../support/api";

test.beforeEach(async ({ page }) => {
  await login(page.request);
});

/** Waits until the player can play: samples decoded, renderer (WebGL) running. */
async function waitForPlayer(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Lecture" })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText("Le rendu graphique (WebGL) n'est pas disponible.")).toHaveCount(0);
}

function position(page: Page): Promise<number> {
  return page.getByRole("slider", { name: "Position dans le morceau" }).inputValue().then(Number);
}

test("plays a song from its page, on the audio clock", async ({ page }) => {
  const song = await importSong(page.request, "Gamme");
  await page.goto(`/songs/${song.id}`);

  await page.getByRole("link", { name: "Jouer" }).click();
  await waitForPlayer(page);
  await page.getByRole("button", { name: "Lecture" }).click();

  await expect(page.getByRole("button", { name: "Pause" })).toBeAttached();
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(1500);
});

test("slows down and loops a passage", async ({ page }) => {
  const song = await importSong(page.request, "Boucle");
  await page.goto(`/songs/${song.id}/play`);
  await waitForPlayer(page);

  await page.getByRole("button", { name: "Réglages du lecteur" }).click();
  await page.getByRole("button", { name: "Ralentir" }).click();
  await page.getByRole("button", { name: "Boucles (0)" }).click();
  await page.getByRole("button", { name: "Début de boucle (A)" }).click();
  await page.getByRole("button", { name: "Avancer de 5 secondes" }).click();
  await page.getByRole("button", { name: "Fin de boucle (B)" }).click();
  await expect(page.getByTestId("tempo-badge")).toHaveText("95 %");
  await expect(page.getByText("A 0:00 · B 0:05")).toBeVisible();

  await page.getByRole("button", { name: "Lecture" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeAttached();
  // Playing: the position goes up to the end of the loop (5 s at 95 %), then back to A.
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeGreaterThan(3000);
  await expect.poll(() => position(page), { timeout: 10_000 }).toBeLessThan(2000);
});

test("leaves the full screen with the player", async ({ page }) => {
  const song = await importSong(page.request, "Plein écran");
  await page.goto(`/songs/${song.id}/play`);
  await waitForPlayer(page);
  const fullscreen = () => page.evaluate(() => document.fullscreenElement !== null);

  await page.getByRole("button", { name: "Plein écran" }).click();
  await expect.poll(fullscreen).toBe(true);
  await page.getByRole("link", { name: "Quitter le lecteur" }).click();

  await expect(page.getByRole("heading", { name: "Plein écran", level: 1 })).toBeVisible();
  await expect.poll(fullscreen).toBe(false);
});
