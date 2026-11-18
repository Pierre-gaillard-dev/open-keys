import { expect, type Page, test } from "@playwright/test";
import { importSong, login } from "../support/api";

/** Song ids whose MIDI is stored on the device (IndexedDB of the app). */
function storedSongIds(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("open-keys");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const keys = open.result.transaction("midiFiles").objectStore("midiFiles").getAllKeys();
          keys.onsuccess = () => resolve(keys.result.map(String));
          keys.onerror = () => reject(keys.error);
        };
      }),
  );
}

test("airplane mode: practise a favorite, then find the new loop on another device", async ({
  browser,
  page,
}) => {
  await login(page.request);
  const song = await importSong(page.request, "Favori hors-ligne");

  // Online: mark as favorite, the song is stored on the device.
  await page.goto(`/songs/${song.id}`);
  await page.getByRole("button", { name: "Ajouter aux favoris" }).click();
  await expect.poll(() => storedSongIds(page)).toContain(song.id);
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Airplane mode, and the app is opened again (shell served by the service worker).
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole("link", { name: "Open Keys" }).click();
  await expect(
    page.getByText("Seuls les morceaux disponibles sur cet appareil sont affichés."),
  ).toBeVisible();

  // Play it and create a loop. Every favorite of the account is on the device (other tests included).
  await page.locator(`a[href="/songs/${song.id}"]`).click();
  await page.getByRole("link", { name: /Jouer|Reprendre/ }).click();
  await expect(page.getByRole("button", { name: "Lecture" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: /Boucles/ }).click();
  await page.getByRole("button", { name: "Début de boucle (A)" }).click();
  await page.getByRole("button", { name: "Avancer de 5 secondes" }).click();
  await page.getByRole("button", { name: "Fin de boucle (B)" }).click();
  await page.getByLabel("Boucle 0:00 – 0:05").fill("Pont");
  await page.getByRole("button", { name: "Enregistrer la boucle" }).click();
  await expect(page.getByRole("button", { name: /^Pont/ })).toBeVisible();
  await page.getByRole("link", { name: "Quitter le lecteur" }).click();
  await expect(
    page.getByRole("status", { name: /^Hors-ligne, \d+ modifications? en attente$/ }),
  ).toBeVisible();

  // Network back: the writes are sent.
  await page.context().setOffline(false);
  await expect(page.getByRole("status", { name: /Hors-ligne|Synchronisation/ })).toHaveCount(0, {
    timeout: 30_000,
  });

  // Another device sees the loop.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage.request);
  await otherPage.goto(`/songs/${song.id}`);
  await expect(otherPage.getByText("Pont")).toBeVisible();
  await other.close();
});
