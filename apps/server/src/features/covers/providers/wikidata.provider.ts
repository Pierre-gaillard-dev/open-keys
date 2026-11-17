import { z } from "zod";
import type { CoverCandidate, CoverProvider, HttpGet } from "./cover-provider.types";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const IMAGE_PROPERTY = "P18";
const OCCUPATION_PROPERTY = "P106";
/** composer, songwriter, film score composer, pianist */
const MUSICIAN_OCCUPATIONS: ReadonlySet<string> = new Set(["Q36834", "Q753110", "Q1415090", "Q486748"]);
const THUMBNAIL_WIDTH = 320;
const IMAGE_WIDTH = 1024;

const searchSchema = z.object({ search: z.array(z.object({ id: z.string() })).default([]) });

const claimSchema = z.object({
  mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }),
});

const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
      claims: z.record(z.string(), z.array(claimSchema)).optional(),
    }),
  ),
});

const imageInfoSchema = z.object({
  query: z.object({
    pages: z.record(
      z.string(),
      z.object({
        imageinfo: z
          .array(
            z.object({
              thumburl: z.string(),
              extmetadata: z
                .object({
                  Artist: z.object({ value: z.string() }).optional(),
                  LicenseShortName: z.object({ value: z.string() }).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
});

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function claimValues(claims: z.infer<typeof claimSchema>[] | undefined): unknown[] {
  return (claims ?? []).map((claim) => claim.mainsnak.datavalue?.value);
}

/** Wikidata P18 image of a person whose occupation is composer/musician. */
function findPortrait(entities: z.infer<typeof entitiesSchema>["entities"], ids: readonly string[]) {
  for (const id of ids) {
    const entity = entities[id];
    const occupations = claimValues(entity?.claims?.[OCCUPATION_PROPERTY]).map((value) =>
      typeof value === "object" && value !== null && "id" in value ? String(value.id) : "",
    );
    const image = claimValues(entity?.claims?.[IMAGE_PROPERTY]).find((value) => typeof value === "string");
    if (typeof image === "string" && occupations.some((occupation) => MUSICIAN_OCCUPATIONS.has(occupation))) {
      return { image, label: entity?.labels?.["en"]?.value ?? id };
    }
  }
  return undefined;
}

/** Composer portraits: the right cover for classical works, which have no single reference album. */
export function createWikidataProvider(httpGet: HttpGet): CoverProvider {
  const getJson = async (url: string, signal: AbortSignal): Promise<unknown> => {
    const response = await httpGet(url, { signal });
    return response.ok ? response.json() : {};
  };

  return {
    source: "wikidata",
    async search({ composer }, signal) {
      if (!composer) {
        return [];
      }
      const search = searchSchema.parse(
        await getJson(
          `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(composer)}&language=en&type=item&limit=5&format=json`,
          signal,
        ),
      );
      const ids = search.search.map((result) => result.id);
      if (ids.length === 0) {
        return [];
      }
      const { entities } = entitiesSchema.parse(
        await getJson(
          `${WIKIDATA_API}?action=wbgetentities&ids=${ids.join("|")}&props=claims|labels&languages=en&format=json`,
          signal,
        ),
      );
      const portrait = findPortrait(entities, ids);
      if (!portrait) {
        return [];
      }
      const info = imageInfoSchema.parse(
        await getJson(
          `${COMMONS_API}?action=query&titles=${encodeURIComponent(`File:${portrait.image}`)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${THUMBNAIL_WIDTH}&format=json`,
          signal,
        ),
      );
      const imageInfo = Object.values(info.query.pages)[0]?.imageinfo?.[0];
      if (!imageInfo) {
        return [];
      }
      const author = stripHtml(imageInfo.extmetadata?.Artist?.value ?? "") || "Unknown author";
      const license = imageInfo.extmetadata?.LicenseShortName?.value ?? "see Wikimedia Commons";
      const candidate: CoverCandidate = {
        source: "wikidata",
        thumbnailUrl: imageInfo.thumburl,
        imageUrl: imageInfo.thumburl.replace(`/${THUMBNAIL_WIDTH}px-`, `/${IMAGE_WIDTH}px-`),
        label: `Portrait · ${portrait.label}`,
        credit: `${author} · ${license} · Wikimedia Commons`,
      };
      return [candidate];
    },
  };
}
