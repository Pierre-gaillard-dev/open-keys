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
  it("queue a recording, transcribe it and import it as a draft to review, which keeps the recording", async () => {
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
    // D35: the song keeps its recording, served with byte ranges for the player.
    expect(song.audioUrl).toBe(`/api/songs/${song.id}/audio`);
    expect(await server.storage.list("audio")).toHaveLength(1);
    const whole = await server.request(song.audioUrl ?? "");
    expect(whole.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(RECORDING);
    const part = await server.request(song.audioUrl ?? "", { headers: { Range: "bytes=4-7" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe(`bytes 4-7/${RECORDING.byteLength}`);
    expect(new TextDecoder().decode(await part.arrayBuffer())).toBe("pret");
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
    expect(list).toEqual({ available: false, acceptsUrls: false, jobs: [] });
    const response = await send();
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("SERVICE_UNAVAILABLE");
  });

  describe("from the app that fetches recordings (D35)", () => {
    const SOURCE = "https://music.example.org";
    const URL_OF_RECORDING = `${SOURCE}/files/One%20More%20Light.opus`;
    const OPUS = new TextEncoder().encode("OggS opus recording bytes");
    const TOKEN = "a-long-integration-key-of-32-characters!";

    async function urlServer(env: NodeJS.ProcessEnv = {}) {
      const transcriber = fakeTranscriber(() => twoHandMidi("Transcription"));
      server = await createTestServer({
        transcriber: transcriber.client,
        env: { AUDIO_SOURCES: SOURCE, ...env },
        remoteFiles: { [URL_OF_RECORDING]: OPUS },
      });
      await server.login();
      return transcriber;
    }

    it("transcribe a recording by its URL, and the song plays it back through Open Keys", async () => {
      const transcriber = await urlServer();
      const queued = await job(
        await server.json("POST", "/api/transcriptions/url", { url: URL_OF_RECORDING }),
      );
      expect(queued.fileName).toBe("One More Light.opus");

      await server.services.transcriptions.processNext();

      expect(transcriber.calls[0]?.audio).toEqual(OPUS);
      const done = await job(await server.request(`/api/transcriptions/${queued.id}`));
      const song = songDetailSchema.parse(await (await server.request(`/api/songs/${done.songId}`)).json());
      expect(song.audioUrl).toBe(`/api/songs/${song.id}/audio`);
      // Nothing kept here: the recording stays at its source, relayed with its byte ranges.
      expect(await server.storage.list("audio")).toHaveLength(0);
      const part = await server.request(song.audioUrl ?? "", { headers: { Range: "bytes=0-3" } });
      expect(part.status).toBe(206);
      expect(new TextDecoder().decode(await part.arrayBuffer())).toBe("OggS");
      const list = transcriptionsSchema.parse(await (await server.request("/api/transcriptions")).json());
      expect(list.acceptsUrls).toBe(true);
    });

    it("refuse an address outside the audio sources, and say when the recording cannot be fetched", async () => {
      await urlServer();
      const outside = await server.json("POST", "/api/transcriptions/url", {
        url: "https://evil.example.com/a.mp3",
      });
      expect(outside.status).toBe(400);

      const missing = await job(
        await server.json("POST", "/api/transcriptions/url", { url: `${SOURCE}/files/missing.opus` }),
      );
      await server.services.transcriptions.processNext();
      expect((await job(await server.request(`/api/transcriptions/${missing.id}`))).error).toBe(
        "unreachable",
      );
    });

    it("take recordings from the other app with its key, for the integration account", async () => {
      await urlServer({
        INTEGRATION_TOKEN: TOKEN,
        INTEGRATION_USERNAME: "pierre",
        PUBLIC_URL: "https://keys.example.org",
      });
      const call = (method: string, path: string, key: string | null, body?: unknown) =>
        server.request(path, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });

      expect(
        (await call("POST", "/api/integrations/transcriptions", null, { url: URL_OF_RECORDING })).status,
      ).toBe(401);
      expect(
        (await call("POST", "/api/integrations/transcriptions", "wrong", { url: URL_OF_RECORDING })).status,
      ).toBe(401);

      const created = await call("POST", "/api/integrations/transcriptions", TOKEN, {
        url: URL_OF_RECORDING,
        title: "One More Light",
      });
      expect(created.status).toBe(201);
      const { job: queued } = (await created.json()) as { job: TranscriptionJob };
      expect(queued.fileName).toBe("One More Light");

      await server.services.transcriptions.processNext();

      const status = (await (
        await call("GET", `/api/integrations/transcriptions/${queued.id}`, TOKEN)
      ).json()) as {
        job: TranscriptionJob;
        reviewUrl: string | null;
      };
      expect(status.job.status).toBe("done");
      expect(status.reviewUrl).toBe(`https://keys.example.org/import/${status.job.songId}`);
      // The account of the integration sees it in its own list.
      const list = transcriptionsSchema.parse(await (await server.request("/api/transcriptions")).json());
      expect(list.jobs.map((item) => item.id)).toEqual([queued.id]);
    });

    it("are not reachable without an integration key configured", async () => {
      await urlServer();
      const response = await server.request("/api/integrations/transcriptions", { method: "POST" });
      expect(response.status).toBe(404);
    });
  });
});
