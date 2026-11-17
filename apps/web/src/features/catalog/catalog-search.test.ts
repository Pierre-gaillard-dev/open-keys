import { describe, expect, it } from "vitest";
import { catalogSearchSchema, toSongsQuery } from "./catalog-search";

describe("catalogSearchSchema", () => {
  it("drops invalid values instead of failing", () => {
    expect(catalogSearchSchema.parse({ view: "nope", sort: "random", q: "satie" })).toEqual({
      q: "satie",
      view: undefined,
      sort: undefined,
      tags: undefined,
    });
  });
});

describe("toSongsQuery", () => {
  it("maps the favorites view to the favorite filter", () => {
    expect(toSongsQuery({ view: "favorites" })).toMatchObject({ favorite: "true", status: undefined });
  });

  it("maps status views to the status filter", () => {
    expect(toSongsQuery({ view: "learning", tags: ["lent"], q: "  " })).toMatchObject({
      status: "learning",
      tags: ["lent"],
      q: undefined,
    });
  });
});
