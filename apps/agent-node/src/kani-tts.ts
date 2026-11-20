import { AudioByteStream, shortuuid, tts } from "@livekit/agents";
import { OpenAI } from "openai";

export const KANI_SAMPLE_RATE = 22050;
export const KANI_CHANNELS = 1;
export const DEFAULT_KANI_VOICE = "elina";
export const DEFAULT_KANI_MODEL = "nineninesix/kani-tts-400m-ky";

export type KyrgyzReplyMode = "voice" | "text";
export type KaniHealth = "ok" | "loading" | "down";

export type KaniConfig = {
  baseURL: string;
  apiKey: string;
  voice: string;
  model: string;
  timeoutMs: number;
};

export function normalizeKaniBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function readKaniConfig(env: NodeJS.ProcessEnv = process.env): KaniConfig {
  const baseURL = normalizeKaniBaseUrl(env.KANI_BASE_URL ?? "");
  if (!baseURL) {
    throw new Error(
      "un-ai: для ky нужен KANI_BASE_URL (KaniTTS, POST /v1/audio/speech). Cartesia для ky не используем.",
    );
  }
  const timeoutMs = Number(env.KANI_TIMEOUT_MS ?? 60_000);
  return {
    baseURL,
    apiKey: env.KANI_API_KEY?.trim() || "not-needed",
    voice: env.KANI_VOICE?.trim() || DEFAULT_KANI_VOICE,
    model: env.KANI_MODEL?.trim() || DEFAULT_KANI_MODEL,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
  };
}

/** Voice only when the sidecar has the Kyrgyz checkpoint loaded. Otherwise the on-screen reply stays. */
export function kyrgyzReplyMode(kaniReady: boolean): KyrgyzReplyMode {
  return kaniReady ? "voice" : "text";
}

/** Accept WAV or raw PCM. KaniTTS is 22050 Hz mono 16-bit. */
export function pcmFromSpeechBody(buffer: ArrayBuffer): {
  pcm: ArrayBuffer;
  sampleRate: number;
} {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    return { pcm: buffer, sampleRate: KANI_SAMPLE_RATE };
  }

  let offset = 12;
  let sampleRate = KANI_SAMPLE_RATE;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = bytes[offset + 4]! | (bytes[offset + 5]! << 8) | (bytes[offset + 6]! << 16) | (bytes[offset + 7]! << 24);
    const start = offset + 8;
    if (id === "fmt " && size >= 16) {
      sampleRate =
        bytes[start + 4]! |
        (bytes[start + 5]! << 8) |
        (bytes[start + 6]! << 16) |
        (bytes[start + 7]! << 24);
    }
    if (id === "data") {
      return { pcm: buffer.slice(start, start + size), sampleRate: sampleRate || KANI_SAMPLE_RATE };
    }
    offset = start + size + (size % 2);
  }
  return { pcm: buffer, sampleRate: KANI_SAMPLE_RATE };
}

export function silentPcm(sampleRate: number, durationMs: number): ArrayBuffer {
  const samples = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  return new ArrayBuffer(samples * 2);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export class KaniTts extends tts.TTS {
  label = "un-ai.KaniTts";
  #client: OpenAI;
  #voice: string;
  #model: string;

  constructor(opts: { baseURL: string; apiKey: string; voice: string; model: string; timeoutMs: number }) {
    super(KANI_SAMPLE_RATE, KANI_CHANNELS, { streaming: false });
    this.#voice = opts.voice;
    this.#model = opts.model;
    this.#client = new OpenAI({
      baseURL: opts.baseURL,
      apiKey: opts.apiKey,
      maxRetries: 0,
      timeout: opts.timeoutMs,
    });
  }

  get model(): string {
    return this.#model;
  }

  get provider(): string {
    return "nineninesix/kani-tts";
  }

  synthesize(text: string): tts.ChunkedStream {
    return new KaniChunkedStream(
      this,
      text,
      this.#client.audio.speech.create({
        input: text,
        model: this.#model,
        voice: this.#voice as "alloy",
        response_format: "wav",
      }),
    );
  }

  stream(): tts.SynthesizeStream {
    throw new Error("KaniTTS is sentence-chunked by LiveKit StreamAdapter, not a native stream");
  }
}

class KaniChunkedStream extends tts.ChunkedStream {
  label = "un-ai.KaniChunkedStream";
  #response: Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;

  constructor(engine: KaniTts, text: string, response: Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>) {
    super(text, engine);
    this.#response = response;
  }

  protected async run(): Promise<void> {
    try {
      let pcm: ArrayBuffer;
      let sampleRate = KANI_SAMPLE_RATE;
      try {
        const buffer = await this.#response.then((body) => body.arrayBuffer());
        const parsed = pcmFromSpeechBody(buffer);
        pcm = parsed.pcm;
        sampleRate = parsed.sampleRate || KANI_SAMPLE_RATE;
        if (pcm.byteLength < 2) {
          pcm = silentPcm(sampleRate, 20);
        }
      } catch (error) {
        console.warn("un-ai: KaniTTS request failed, silent frame", error);
        pcm = silentPcm(KANI_SAMPLE_RATE, 20);
        sampleRate = KANI_SAMPLE_RATE;
      }
      this.#emit(pcm, sampleRate);
    } finally {
      this.queue.close();
    }
  }

  #emit(pcm: ArrayBuffer, sampleRate: number): void {
    const requestId = shortuuid();
    const audioByteStream = new AudioByteStream(sampleRate || KANI_SAMPLE_RATE, KANI_CHANNELS);
    const frames = [...audioByteStream.write(pcm), ...audioByteStream.flush()];
    let lastFrame = frames.pop();
    for (const frame of frames) {
      this.queue.put({ requestId, segmentId: requestId, frame, final: false });
    }
    if (lastFrame) {
      this.queue.put({ requestId, segmentId: requestId, frame: lastFrame, final: true });
    }
  }
}

export function createKyrgyzTts(env: NodeJS.ProcessEnv = process.env): KaniTts {
  return new KaniTts(readKaniConfig(env));
}

export async function readKaniHealth(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 2500,
): Promise<KaniHealth> {
  let baseURL: string;
  try {
    baseURL = readKaniConfig(env).baseURL;
  } catch {
    return "down";
  }
  const healthURL = `${baseURL.replace(/\/v1$/, "")}/health`;
  try {
    const response = await fetch(healthURL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return "down";
    const body = (await response.json()) as { status?: string };
    if (body.status === "ok") return "ok";
    if (body.status === "loading") return "loading";
    return "down";
  } catch {
    return "down";
  }
}

/** True only when the GPU server answers /health with status ok. A dead tunnel is false. */
export async function kaniSpeechReachable(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 2500,
): Promise<boolean> {
  return (await readKaniHealth(env, timeoutMs)) === "ok";
}

export async function waitUntilKaniReady(
  env: NodeJS.ProcessEnv = process.env,
  opts: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    probe?: () => Promise<KaniHealth>;
  } = {},
): Promise<boolean> {
  const configured = Number(env.KANI_READY_TIMEOUT_MS ?? 8_000);
  const timeoutMs = opts.timeoutMs ?? (Number.isFinite(configured) && configured >= 0 ? configured : 8_000);
  const intervalMs = opts.intervalMs ?? 400;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = opts.now ?? Date.now;
  const probe = opts.probe ?? (() => readKaniHealth(env));
  const deadline = now() + timeoutMs;
  for (;;) {
    const health = await probe();
    if (health === "ok") return true;
    if (health !== "loading" || now() >= deadline) return false;
    await sleep(intervalMs);
  }
}
