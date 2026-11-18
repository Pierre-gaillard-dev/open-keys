/**
 * Benchmark of the hand separation (D28), to run again after any change to the algorithm or its
 * weights:
 *
 *   pnpm --filter @open-keys/server hands:benchmark <corpus-dir> [count]
 *
 * The corpus is made of Mutopia solo piano pieces (public domain or Creative Commons), downloaded once
 * into `<corpus-dir>` at one request per second, never committed. Their two tracks are the two staves:
 * merged, separated by the algorithm, compared to the staff of each note.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeMidi, parseMidiNotes, separateHands } from "@open-keys/core";
import { createMutopiaProvider } from "../src/features/sources/providers/mutopia/mutopia.provider";

const USER_AGENT = {
  "User-Agent": "OpenKeys-hands-benchmark ( https://github.com/Pierre-gaillard-dev/open-keys )",
};
const [corpusDir, countArg] = process.argv.slice(2);
if (!corpusDir) {
  throw new Error("Usage: hands-benchmark <corpus-dir> [count]");
}
const count = Number(countArg ?? 220);

async function download(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).some((file) => file.endsWith(".mid"))) {
    return;
  }
  const get = (url: string, init: { signal: AbortSignal }) => fetch(url, { ...init, headers: USER_AGENT });
  const provider = createMutopiaProvider({ get, download: async () => new Uint8Array() });
  const solo = (await provider.list(AbortSignal.timeout(600_000))).filter((piece) => piece.solo);
  // Spread over the whole listing: a variety of composers and periods.
  const step = Math.max(1, Math.floor(solo.length / count));
  for (const piece of solo.filter((_, index) => index % step === 0).slice(0, count)) {
    const file = join(dir, `${piece.externalId}.mid`);
    if (!existsSync(file)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await fetch(piece.midiRef, { headers: USER_AGENT });
      if (response.ok) {
        writeFileSync(file, new Uint8Array(await response.arrayBuffer()));
      }
    }
  }
}

await download(corpusDir);
let total = 0;
let byAlgorithm = 0;
let byMiddleC = 0;
let pieces = 0;
for (const file of readdirSync(corpusDir).filter((name) => name.endsWith(".mid"))) {
  const bytes = new Uint8Array(readFileSync(join(corpusDir, file)));
  const tracks = analyzeMidi(bytes).tracks.filter((track) => !track.isPercussion);
  const [first, second] = tracks;
  if (!(first && second) || tracks.length !== 2) {
    continue;
  }
  const right = first.averagePitch > second.averagePitch ? first.index : second.index;
  const notes = parseMidiNotes(bytes).notes.filter((note) => tracks.some((t) => t.index === note.trackIndex));
  const hands = separateHands(notes);
  notes.forEach((note, index) => {
    const truth = note.trackIndex === right ? "right" : "left";
    byAlgorithm += hands[index] === truth ? 1 : 0;
    byMiddleC += (note.pitch >= 60 ? "right" : "left") === truth ? 1 : 0;
  });
  total += notes.length;
  pieces++;
}
const percent = (value: number) => `${((100 * value) / total).toFixed(1)} %`;
process.stdout.write(
  `${pieces} pieces, ${total} notes: algorithm ${percent(byAlgorithm)}, split at C4 ${percent(byMiddleC)}\n`,
);
