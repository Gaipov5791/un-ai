import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger } from "@livekit/agents";
import {
  DEFAULT_KANI_MODEL,
  DEFAULT_KANI_VOICE,
  createKyrgyzTts,
  kaniSpeechReachable,
  kyrgyzReplyMode,
  normalizeKaniBaseUrl,
  pcmFromSpeechBody,
  readKaniConfig,
  readKaniHealth,
  waitUntilKaniReady,
} from "./kani-tts.ts";

function wavWithPcm(pcm: Uint8Array, sampleRate = 22050): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const out = new Uint8Array(44 + pcm.byteLength);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out.buffer;
}

describe("KaniTTS config", () => {
  it("appends /v1 once", () => {
    assert.equal(normalizeKaniBaseUrl("http://gpu:8000"), "http://gpu:8000/v1");
    assert.equal(normalizeKaniBaseUrl("http://gpu:8000/v1/"), "http://gpu:8000/v1");
  });

  it("requires KANI_BASE_URL", () => {
    assert.throws(() => readKaniConfig({}), /KANI_BASE_URL/);
  });

  it("defaults voice to elina and model to the Kyrgyz checkpoint", () => {
    const config = readKaniConfig({ KANI_BASE_URL: "http://gpu:8000" });
    assert.equal(config.voice, DEFAULT_KANI_VOICE);
    assert.equal(config.model, DEFAULT_KANI_MODEL);
    assert.equal(config.apiKey, "not-needed");
    assert.equal(config.baseURL, "http://gpu:8000/v1");
    assert.equal(config.timeoutMs, 60_000);
  });

  it("reads model, voice and timeout from the environment", () => {
    const config = readKaniConfig({
      KANI_BASE_URL: "http://gpu:8090/v1",
      KANI_MODEL: "nineninesix/kani-tts-400m-ky",
      KANI_VOICE: "syimyk",
      KANI_TIMEOUT_MS: "15000",
      KANI_API_KEY: "local",
    });
    assert.equal(config.model, "nineninesix/kani-tts-400m-ky");
    assert.equal(config.voice, "syimyk");
    assert.equal(config.timeoutMs, 15_000);
    assert.equal(config.apiKey, "local");
  });
});

describe("Kyrgyz reply mode", () => {
  it("uses KaniTTS only when the sidecar is ready", () => {
    assert.equal(kyrgyzReplyMode(true), "voice");
    assert.equal(kyrgyzReplyMode(false), "text");
  });
});

describe("KaniTTS health", () => {
  it("is reachable only when /health says ok", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "ok" }), { status: 200 })) as typeof fetch;
    try {
      assert.equal(await kaniSpeechReachable({ KANI_BASE_URL: "https://gpu.example/v1" }), true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("is down when the tunnel answers with an error", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("tunnel down", { status: 530 })) as typeof fetch;
    try {
      assert.equal(await kaniSpeechReachable({ KANI_BASE_URL: "https://gpu.example/v1" }), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("is down when the address is empty", async () => {
    assert.equal(await kaniSpeechReachable({}), false);
  });

  it("treats a still-loading model as not ready", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "loading" }), { status: 200 })) as typeof fetch;
    try {
      assert.equal(await readKaniHealth({ KANI_BASE_URL: "http://gpu:8090" }), "loading");
      assert.equal(await kaniSpeechReachable({ KANI_BASE_URL: "http://gpu:8090" }), false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("KaniTTS ready wait", () => {
  it("waits through loading and then accepts ok", async () => {
    const states = ["loading", "loading", "ok"] as const;
    let index = 0;
    let clock = 0;
    const ready = await waitUntilKaniReady(
      {},
      {
        timeoutMs: 5_000,
        intervalMs: 10,
        now: () => clock,
        sleep: async () => {
          clock += 10;
        },
        probe: async () => states[Math.min(index++, states.length - 1)] ?? "down",
      },
    );
    assert.equal(ready, true);
    assert.equal(index, 3);
  });

  it("does not wait when the sidecar is down", async () => {
    let slept = 0;
    const ready = await waitUntilKaniReady(
      {},
      {
        timeoutMs: 5_000,
        sleep: async () => {
          slept += 1;
        },
        probe: async () => "down",
      },
    );
    assert.equal(ready, false);
    assert.equal(slept, 0);
  });

  it("gives up when loading outlasts the timeout", async () => {
    let clock = 0;
    const ready = await waitUntilKaniReady(
      {},
      {
        timeoutMs: 20,
        intervalMs: 10,
        now: () => clock,
        sleep: async () => {
          clock += 10;
        },
        probe: async () => "loading",
      },
    );
    assert.equal(ready, false);
  });
});

describe("KaniTTS synthesize", () => {
  it("posts the Kyrgyz checkpoint and decodes the wav", async () => {
    initializeLogger({ pretty: false, level: "warn" });
    const original = globalThis.fetch;
    let url = "";
    let payload = "";
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      url = String(input);
      payload = String(init?.body ?? "");
      return new Response(wavWithPcm(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    }) as typeof fetch;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const engine = createKyrgyzTts({
        KANI_BASE_URL: "http://kani.test:8090",
        KANI_MODEL: DEFAULT_KANI_MODEL,
        KANI_VOICE: "elina",
      });
      assert.equal(engine.model, DEFAULT_KANI_MODEL);
      assert.equal(engine.provider, "nineninesix/kani-tts");
      const frames = [];
      for await (const event of engine.synthesize("Саламатсызбы! Мен сизге кантип жардам бере алам?")) {
        frames.push(event);
      }
      assert.match(url, /\/audio\/speech$/);
      assert.match(payload, /nineninesix\/kani-tts-400m-ky/);
      assert.match(payload, /elina/);
      assert.match(payload, /Саламатсызбы/);
      assert.equal(warnings.some((line) => line.includes("KaniTTS request failed")), false);
      assert.ok(frames.length >= 1);
      assert.equal(frames.at(-1)?.final, true);
      assert.equal(frames[0]?.frame.sampleRate, 22050);
    } finally {
      console.warn = originalWarn;
      globalThis.fetch = original;
    }
  });

  it("emits one silent frame when the sidecar fails", async () => {
    initializeLogger({ pretty: false, level: "warn" });
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("tunnel down");
    }) as typeof fetch;
    try {
      const engine = createKyrgyzTts({ KANI_BASE_URL: "http://kani.test:8090" });
      const frames = [];
      for await (const event of engine.synthesize("Саламатсызбы")) frames.push(event);
      assert.equal(frames.length, 1);
      assert.equal(frames[0]?.final, true);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("KaniTTS wav body", () => {
  it("strips a WAV header and keeps 22050", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const parsed = pcmFromSpeechBody(wavWithPcm(payload));
    assert.equal(parsed.sampleRate, 22050);
    assert.deepEqual(new Uint8Array(parsed.pcm), payload);
  });

  it("passes raw PCM through", () => {
    const raw = new Uint8Array([9, 8, 7, 6]).buffer;
    const parsed = pcmFromSpeechBody(raw);
    assert.equal(parsed.sampleRate, 22050);
    assert.deepEqual(new Uint8Array(parsed.pcm), new Uint8Array([9, 8, 7, 6]));
  });
});
