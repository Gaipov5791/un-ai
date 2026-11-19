import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeLogger } from "@livekit/agents";
import { CaptionTts } from "./caption-tts.ts";

describe("Caption TTS", () => {
  it("finishes the phrase with one silent frame and does not touch the network", async () => {
    initializeLogger({ pretty: false, level: "warn" });
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      throw new Error("caption TTS must not fetch");
    }) as typeof fetch;

    try {
      const stream = new CaptionTts().synthesize("Саламатсызбы");
      const frames = [];
      for await (const event of stream) frames.push(event);
      assert.equal(frames.length, 1);
      assert.equal(frames[0]?.final, true);
      assert.ok((frames[0]?.frame.samplesPerChannel ?? 0) > 0);
      assert.equal(calls.length, 0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
