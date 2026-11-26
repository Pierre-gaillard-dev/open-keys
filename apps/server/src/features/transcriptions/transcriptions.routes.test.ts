import {
  errorResponseSchema,
  songDetailSchema,
  type TranscriptionJob,
  transcriptionJobSchema,
  transcriptionsSchema,
} from "@open-keys/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { twoHandMidi } from "../../test/fixtures";
import { createTestServer, type TestServer } from "../../test/test-server";
import { type TranscriberClient, TranscriberUnavailable, TranscriptionFailure } from "./transcriber-client";
import { MAX_PENDING_PER_USER } from "./transcriptions.service";

let server: TestServer;

afterEach(() => server?.close());

const RECORDING = new TextEncoder().encode("ID3 pretend this is an mp3");

/** A transcriber that answers with `answer` (a MIDI, or an error to throw) and records its calls. */
function fakeTranscriber(answer: () => Uint8Array) {
  const calls: { audio: Uint8Array; title: string }[] = [];
  const client: TranscriberClient = {
    transcribe(audio, title) {
      calls.push({ audio, title });
      try {
        return Promise.resolve(answer());
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
  return { client, calls };
}

async function setup(answer: () => Uint8Array = () => twoHandMidi("Transcription")) {
  const transcriber = fakeTranscriber(answer);
  server = await createTestServer({ transcriber: transcriber.client });
  await server.login();
  return transcriber;
}

function send(name = "One More Light - piano cover.opus", durationS?: number) {
  const form = new FormData();
  form.append("file", new File([RECORDING.slice().buffer], name));
  if (durationS !== undefined) {
    form.append("durationS", String(durationS));
  }
  return server.request("/api/transcriptions", { method: "POST", body: form });
}

async function job(response: Response): Promise<TranscriptionJob> {
  return transcriptionJobSchema.parse(await response.json());
}

async function errorCode(response: Response) {
  return errorResponseSchema.parse(await response.json()).error.code;
}

describe("transcriptions (D34)", () => {
  it("queue a recording, transcribe it and import it as a draft to review, then drop the recording", async () => {
    const transcriber = await setup();

    const queued = await job(await send("One More Light - piano cover.opus", 265));
    expect(queued).toMatchObject({ status: "queued", queuePosition: 0, durationS: 265, songId: null });
    expect(await server.storage.list("audio")).toHaveLength(1);

    await server.services.transcriptions.processNext();

    expect(transcriber.calls.map((call) => call.title)).toEqual(["One More Light - piano cover"]);
    const done = await job(await server.request(`/api/transcriptions/${queued.id}`));
    expect(done).toMatchObject({ status: "done", queuePosition: null, error: null });
    const song = songDetailSchema.parse(await (await server.request(`/api/songs/${done.songId}`)).json());
    expect(song).toMatchObject({ state: "draft", sourceType: "upload" });
    expect(song.credit).toContain("One More Light - piano cover.opus");
    expect(await server.storage.list("audio")).toHaveLength(0);
  });

  it("say why a recording failed, and drop it", async () => {
    await setup(() => {
      throw new TranscriptionFailure("no_notes");
    });
    const queued = await job(await send());

    await server.services.transcriptions.processNext();

    const list = transcriptionsSchema.parse(await (await server.request("/api/transcriptions")).json());
    expect(list.jobs[0]).toMatchObject({ id: queued.id, status: "failed", error: "no_notes", songId: null });
    expect(await server.storage.list("audio")).toHaveLength(0);
  });

  it("put the recording back in the queue when the transcriber is busy or down", async () => {
    await setup(() => {
      throw new TranscriberUnavailable("busy");
    });
    const queued = await job(await send());

    await server.services.transcriptions.processNext();

    expect(await job(await server.request(`/api/transcriptions/${queued.id}`))).toMatchObject({
      status: "queued",
      startedAt: null,
    });
    expect(await server.storage.list("audio")).toHaveLength(1);
  });

  it("refuse what is not a recording, and limit the recordings waiting", async () => {
    await setup();

    const text = await send("notes.txt");
    expect(text.status).toBe(400);
    expect(await errorCode(text)).toBe("VALIDATION_ERROR");
    expect((await send("long.mp3", 3600)).status).toBe(400);
    for (let i = 0; i < MAX_PENDING_PER_USER; i++) {
      expect((await send(`take ${i}.mp3`)).status).toBe(201);
    }
    const tooMany = await send("one more.mp3");
    expect(tooMany.status).toBe(429);
  });

  it("are personal", async () => {
    await setup();
    const queued = await job(await send());
    await server.addUser("claire");
    server.forgetSession();
    await server.login("claire");

    expect((await server.request(`/api/transcriptions/${queued.id}`)).status).toBe(404);
    const list = transcriptionsSchema.parse(await (await server.request("/api/transcriptions")).json());
    expect(list.jobs).toEqual([]);
  });

  it("queue again a transcription interrupted by a restart", async () => {
    // A transcriber that never answers: the job stays running, as when the server stops meanwhile.
    server = await createTestServer({ transcriber: { transcribe: () => new Promise(() => undefined) } });
    await server.login();
    const queued = await job(await send());
    void server.services.transcriptions.processNext();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await job(await server.request(`/api/transcriptions/${queued.id}`))).status).toBe("running");

    expect(server.services.transcriptions.recover()).toBe(1);
    expect(await job(await server.request(`/api/transcriptions/${queued.id}`))).toMatchObject({
      status: "queued",
      queuePosition: 0,
    });
  });

  it("are unavailable without a transcriber", async () => {
    server = await createTestServer();
    await server.login();

    const list = transcriptionsSchema.parse(await (await server.request("/api/transcriptions")).json());
    expect(list).toEqual({ available: false, jobs: [] });
    const response = await send();
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("SERVICE_UNAVAILABLE");
  });
});
