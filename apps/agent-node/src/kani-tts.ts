import { AudioByteStream, shortuuid, tts } from "@livekit/agents";
import { OpenAI } from "openai";

export const KANI_SAMPLE_RATE = 22050;
export const KANI_CHANNELS = 1;
export const DEFAULT_KANI_VOICE = "elina";

export function normalizeKaniBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function readKaniConfig(env: NodeJS.ProcessEnv = process.env): {
  baseURL: string;
  apiKey: string;
  voice: string;
} {
  const baseURL = normalizeKaniBaseUrl(env.KANI_BASE_URL ?? "");
  if (!baseURL) {
    throw new Error(
      "un-ai: для ky нужен KANI_BASE_URL (KaniTTS: Kaggle T4 или GPU/VPS, POST /v1/audio/speech). Cartesia для ky больше не используем.",
    );
  }
  return {
    baseURL,
    apiKey: env.KANI_API_KEY?.trim() || "not-needed",
    voice: env.KANI_VOICE?.trim() || DEFAULT_KANI_VOICE,
  };
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

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export class KaniTts extends tts.TTS {
  label = "un-ai.KaniTts";
  #client: OpenAI;
  #voice: string;

  constructor(opts: { baseURL: string; apiKey: string; voice: string }) {
    super(KANI_SAMPLE_RATE, KANI_CHANNELS, { streaming: false });
    this.#voice = opts.voice;
    this.#client = new OpenAI({
      baseURL: opts.baseURL,
      apiKey: opts.apiKey,
      maxRetries: 0,
    });
  }

  get model(): string {
    return "kani-tts-400m-ky";
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
        model: "tts-1",
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
      const buffer = await this.#response.then((body) => body.arrayBuffer());
      const { pcm, sampleRate } = pcmFromSpeechBody(buffer);
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
    } finally {
      this.queue.close();
    }
  }
}

export function createKyrgyzTts(env: NodeJS.ProcessEnv = process.env): KaniTts {
  return new KaniTts(readKaniConfig(env));
}

/** True only when the GPU server answers /health with status ok. A dead tunnel is false. */
export async function kaniSpeechReachable(
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = 2500,
): Promise<boolean> {
  let baseURL: string;
  try {
    baseURL = readKaniConfig(env).baseURL;
  } catch {
    return false;
  }
  const healthURL = `${baseURL.replace(/\/v1$/, "")}/health`;
  try {
    const response = await fetch(healthURL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}
