import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_KANI_VOICE,
  kaniSpeechReachable,
  normalizeKaniBaseUrl,
  pcmFromSpeechBody,
  readKaniConfig,
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

  it("defaults voice to elina", () => {
    const config = readKaniConfig({ KANI_BASE_URL: "http://gpu:8000" });
    assert.equal(config.voice, DEFAULT_KANI_VOICE);
    assert.equal(config.apiKey, "not-needed");
    assert.equal(config.baseURL, "http://gpu:8000/v1");
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
