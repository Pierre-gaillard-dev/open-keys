/** One row of maestro-v3.0.0.csv. */
export interface MaestroRow {
  readonly composer: string;
  readonly title: string;
  readonly year: number;
  /** "2018/MIDI-Unprocessed_…_wav--1.midi" */
  readonly midiFilename: string;
  /** Seconds. */
  readonly duration: number;
}

/** One field starting at `start`: its value, and the index just after it. */
function readField(text: string, start: number): { value: string; next: number } {
  if (text[start] !== '"') {
    const end = text.slice(start).search(/[,\r\n]/);
    const next = end === -1 ? text.length : start + end;
    return { value: text.slice(start, next), next };
  }
  let value = "";
  let i = start + 1;
  while (i < text.length) {
    const quote = text.indexOf('"', i);
    if (quote === -1) {
      break;
    }
    value += text.slice(i, quote);
    if (text[quote + 1] !== '"') {
      return { value, next: quote + 1 };
    }
    // Doubled quote: a quote inside the value.
    value += '"';
    i = quote + 2;
  }
  return { value: value + text.slice(i), next: text.length };
}

/** RFC 4180 fields: quoted values may hold commas, line breaks and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i < text.length) {
    const field = readField(text, i);
    row.push(field.value);
    i = field.next;
    if (text[i] === ",") {
      i++;
      continue;
    }
    rows.push(row);
    row = [];
    i += text.startsWith("\r\n", i) ? 2 : 1;
  }
  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}

/** The performances listed by the MAESTRO metadata (header row required). */
export function parseMaestroCsv(text: string): MaestroRow[] {
  const [header = [], ...rows] = parseCsv(text);
  const column = (name: string) => {
    const index = header.indexOf(name);
    if (index === -1) {
      throw new Error(`MAESTRO metadata without a ${name} column`);
    }
    return index;
  };
  const composer = column("canonical_composer");
  const title = column("canonical_title");
  const year = column("year");
  const midi = column("midi_filename");
  const duration = column("duration");
  return rows.map((cells) => ({
    composer: cells[composer] ?? "",
    title: cells[title] ?? "",
    year: Number(cells[year]),
    midiFilename: cells[midi] ?? "",
    duration: Number(cells[duration]),
  }));
}
