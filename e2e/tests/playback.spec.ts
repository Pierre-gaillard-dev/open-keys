import { expect, test } from "@playwright/test";
import { importSong, login } from "../support/api";

test.beforeEach(async ({ page }) => {
  await login(page.request);
});

test("plays a song from its page, on the audio clock", async ({ page }) => {
  const song = await importSong(page.request, "Gamme");
  await page.goto(`/songs/${song.id}`);

  await page.getByRole("link", { name: "Jouer" }).click();
  const play = page.getByRole("button", { name: "Lecture" });
  // Piano samples are downloaded and decoded first.
  await expect(play).toBeEnabled({ timeout: 30_000 });
  await play.click();

  await expect(page.getByRole("button", { name: "Pause" })).toBeAttached();
  const position = page.getByRole("slider", { name: "Position dans le morceau" });
  await expect
    .poll(async () => Number(await position.inputValue()), { timeout: 10_000 })
    .toBeGreaterThan(1500);
});

test("slows down and loops a passage", async ({ page }) => {
  const song = await importSong(page.request, "Boucle");
  await page.goto(`/songs/${song.id}/play`);
  await expect(page.getByRole("button", { name: "Lecture" })).toBeEnabled({ timeout: 30_000 });

  await page.getByRole("button", { name: "Ralentir" }).click();
  await page.getByRole("button", { name: "Début de boucle (A)" }).click();
  await page.getByRole("button", { name: "Avancer de 5 secondes" }).click();
  await page.getByRole("button", { name: "Fin de boucle (B)" }).click();
  await expect(page.getByText("95 %")).toBeVisible();
  await expect(page.getByText("A 0:00 · B 0:05")).toBeVisible();

  await page.getByRole("button", { name: "Lecture" }).click();
  const position = page.getByRole("slider", { name: "Position dans le morceau" });
  // 5 s of loop at 95 %: after 7 s the position went back to A.
  await page.waitForTimeout(7000);
  expect(Number(await position.inputValue())).toBeLessThan(5000);
});
