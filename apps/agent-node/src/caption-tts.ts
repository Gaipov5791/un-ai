import { shortuuid, tts } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const SILENCE_MS = 20;

/** Kyrgyz reply as room text. One silent frame ends the turn without a network call. */
export class CaptionTts extends tts.TTS {
  label = "un-ai.CaptionTts";

  constructor() {
    super(SAMPLE_RATE, CHANNELS, { streaming: false });
  }

  get model(): string {
    return "caption";
  }

  get provider(): string {
    return "un-ai";
  }

  synthesize(text: string): tts.ChunkedStream {
    return new CaptionChunkedStream(this, text);
  }

  stream(): tts.SynthesizeStream {
    throw new Error("Caption TTS is one silent frame, not a stream");
  }
}

class CaptionChunkedStream extends tts.ChunkedStream {
  label = "un-ai.CaptionChunkedStream";

  constructor(engine: CaptionTts, text: string) {
    super(text, engine);
  }

  protected async run(): Promise<void> {
    try {
      const samples = Math.max(1, Math.round((SAMPLE_RATE * SILENCE_MS) / 1000));
      const requestId = shortuuid();
      this.queue.put({
        requestId,
        segmentId: requestId,
        frame: AudioFrame.create(SAMPLE_RATE, CHANNELS, samples),
        final: true,
      });
    } finally {
      this.queue.close();
    }
  }
}
