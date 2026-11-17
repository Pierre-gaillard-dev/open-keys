import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeEntities, isKeyboardSolo, parseListingPage, shortLicense } from "./mutopia.listing";

const LISTING = readFileSync(
  new URL("../../../../test/mutopia-listing.fixture.html", import.meta.url),
  "utf8",
);

describe("parseListingPage", () => {
  it("reads every piece of a real listing page", () => {
    const page = parseListingPage(LISTING);

    expect(page.pieces).toHaveLength(3);
    expect(page.pieces[1]).toEqual({
      mutopiaId: 37,
      title: "Gymnopédie No. 1",
      composer: "E. Satie",
      opus: null,
      instrument: "Piano",
      style: "Classical",
      license: "Public Domain",
      midiUrl: "https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.mid",
      publishedAt: expect.any(Number),
    });
    expect(page.nextStartAt).toBe(10);
  });

  it("keeps a piece split into several MIDI files, without MIDI", () => {
    const zipped = parseListingPage(LISTING).pieces.find((piece) => piece.mutopiaId === 492);

    expect(zipped).toMatchObject({ composer: "J. S. Bach", instrument: "Harpsichord, Piano", midiUrl: null });
  });

  it("has no next page on the last one, and skips unreadable blocks", () => {
    const page = parseListingPage('<table class="table-bordered result-table"><tr><td>?</td></tr></table>');

    expect(page).toEqual({ pieces: [], nextStartAt: null });
  });
});

describe("helpers", () => {
  it.each([
    ["Creative Commons Attribution-ShareAlike 4.0", "CC BY-SA 4.0"],
    ["Creative Commons Attribution 2.5", "CC BY 2.5"],
    ["Public Domain", "Public Domain"],
  ])("shortens %s", (license, short) => {
    expect(shortLicense(license)).toBe(short);
  });

  it.each([
    ["Piano", true],
    ["Harpsichord, Piano, Clavichord", true],
    ["Voice and Piano", false],
    ["Piano Duet", false],
    ["Piano, Violin", false],
  ])("%s is keyboard solo: %s", (instrument, solo) => {
    expect(isKeyboardSolo(instrument)).toBe(solo);
  });

  it("decodes HTML entities", () => {
    expect(decodeEntities("Vocalise &#8470; 1 &amp; Rondo&nbsp;en &#x2013; ré")).toBe(
      "Vocalise № 1 & Rondo en – ré",
    );
  });
});
