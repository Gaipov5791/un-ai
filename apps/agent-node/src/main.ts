import { ServerOptions, cli, defineAgent, inference, voice } from "@livekit/agents";
import { InferenceRunner } from "../node_modules/@livekit/agents/dist/inference_runner.js";
import { JobProcExecutor } from "../node_modules/@livekit/agents/dist/ipc/job_proc_executor.js";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAgent } from "./agent.ts";
import { CaptionTts } from "./caption-tts.ts";
import { createKyrgyzTts, kaniSpeechReachable } from "./kani-tts.ts";
import { KAZAKH_TO_KYRGYZ } from "./kyrgyz.ts";
import { lockLanguageForTts } from "./language-lock.ts";
import { type AgentLanguage } from "./pilot.ts";

const registerRunner = InferenceRunner.registerRunner.bind(InferenceRunner);
InferenceRunner.registerRunner = (method: string, importPath: string) => {
  if (method === "lk_eot_audio") {
    console.warn("un-ai: skip local EOT model, native binding crashes on this Windows host");
    return;
  }
  registerRunner(method, importPath);
};
delete InferenceRunner.registeredRunners.lk_eot_audio;

const rootEnv = path.resolve(fileURLToPath(new URL("../../../.env", import.meta.url)));
dotenv.config({ path: rootEnv });
dotenv.config({ path: ".env.local" });

const AGENT_NAME = process.env.UNAI_AGENT_NAME ?? "un-ai-receptionist";
if (!process.env.KANI_BASE_URL?.trim()) {
  console.warn("un-ai: KANI_BASE_URL пуст — кыргызский звонок не стартует, пока не поднят KaniTTS на GPU/VPS");
}

const KY_VOCABULARY = [
  "Ак-Жол",
  "Айбек",
  "Бишкек",
  "Джал",
  "Ахунбаева",
  "карал",
  "тазалоо",
  "пломба",
  "ооба",
  "жок",
  "жакшы",
  "жазып",
  "коёлу",
  "эртең",
  "бүгүн",
  "саат",
  "ондо",
  "дүйшөмбү",
];

const RU_KEYTERMS = [
  "Ак-Жол",
  "Айбек",
  "Бишкек",
  "Джал",
  "Ахунбаева",
  "осмотр",
  "гигиена",
  "пломба",
  "запись",
  "завтра",
  "сегодня",
];

function languageFromJob(ctx: { job: { metadata?: string }; room: { remoteParticipants: Map<string, { attributes?: Record<string, string> }> } }): AgentLanguage {
  const raw = String(ctx.job.metadata ?? "").trim().toLowerCase();
  if (raw === "ky" || raw === "ru") return raw;
  try {
    const parsed = JSON.parse(raw) as { language?: string };
    if (parsed.language === "ky" || parsed.language === "ru") return parsed.language;
  } catch {
    // metadata is a plain string, not JSON
  }
  for (const participant of ctx.room.remoteParticipants.values()) {
    const attr = String(participant.attributes?.language ?? "").toLowerCase();
    if (attr === "ky" || attr === "ru") return attr;
  }
  return "ru";
}

function createKyrgyzSession(captions: boolean) {
  return new voice.AgentSession({
    stt: new inference.STT({
      model: "google/gemini-3.5-transcribe-live",
      modelOptions: {
        language_codes: ["ky-KG"],
        custom_vocabulary: KY_VOCABULARY,
      },
    }),
    tts: captions ? new CaptionTts() : createKyrgyzTts(),
    vad: null,
    turnDetection: "stt",
    ttsTextTransforms: [
      voice.textTransforms.replace(KAZAKH_TO_KYRGYZ),
      lockLanguageForTts("ky"),
      "filter_markdown",
      "filter_emoji",
    ],
  });
}

function createVoiceSession(language: AgentLanguage) {
  if (language === "ky") {
    return createKyrgyzSession(false);
  }

  return new voice.AgentSession({
    stt: new inference.STT({
      model: "deepgram/nova-3",
      language: "ru",
      modelOptions: {
        numerals: true,
        keyterm: RU_KEYTERMS,
      },
    }),
    tts: new inference.TTS({
      model: "cartesia/sonic-3",
      voice: "779673f3-895f-4935-b6b5-b031dc78b319",
      language: "ru",
    }),
    vad: null,
    turnDetection: "stt",
    ttsTextTransforms: [
      lockLanguageForTts("ru"),
      "filter_markdown",
      "filter_emoji",
    ],
  });
}

export default defineAgent({
  entry: async (ctx) => {
    console.log("un-ai: job entry, connecting to room first");
    await ctx.connect();

    const language = languageFromJob(ctx);
    const captions = language === "ky" && !(await kaniSpeechReachable());
    console.log(
      "un-ai: room connected",
      ctx.room.name,
      "language",
      language,
      captions ? "reply text" : "reply voice",
    );
    try {
      await ctx.room.localParticipant?.setAttributes({
        "unai.reply": captions ? "text" : "voice",
      });
    } catch (err) {
      console.warn("un-ai: reply attribute failed", err);
    }

    const session = captions ? createKyrgyzSession(true) : createVoiceSession(language);

    console.log("un-ai: starting voice session");
    await session.start({
      agent: createAgent(language, captions ? "text" : "voice"),
      room: ctx.room,
      record: false,
      outputOptions: captions ? { syncTranscription: false } : undefined,
    });
    console.log("un-ai: voice session started");

    session.generateReply({
      instructions:
        language === "ky"
          ? captions
            ? "Саламды кыргызча гана жаз, үн жок, казакча эмес. Үлгү: «Саламатсызбы. Ак-Жол стоматологиясы. Кандай жардам бере алам?» Орусча сөздөр (здравствуйте, конечно, запишу, подскажите) жана казак тамгалар ә ғ қ жок. Тилди алмаштырба."
            : "Саламды кыргызча гана айт, казакча эмес. Үлгү: «Саламатсызбы. Ак-Жол стоматологиясы. Кандай жардам бере алам?» Орусча сөздөр (здравствуйте, конечно, запишу, подскажите) жана казак тамгалар ә ғ қ жок. Тилди алмаштырба."
          : "Коротко поздравь от стоматологии Ак-Жол. Только по-русски. Без кыргызских слов (саламатсызбы, кечиресиз, ооба, эртең) и английских фраз. Спроси, чем помочь.",
    });
  },
});

const originalLaunchJob = JobProcExecutor.prototype.launchJob;
JobProcExecutor.prototype.launchJob = async function launchJob(info) {
  const jobId = info?.job?.id ?? "unknown";
  console.log("un-ai: sending startJobRequest", jobId);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return originalLaunchJob.call(this, info);
};

const thisFile = fileURLToPath(import.meta.url);
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs.toLowerCase() === thisFile.toLowerCase()) {
  cli.runApp(
    new ServerOptions({
      agent: thisFile,
      agentName: AGENT_NAME,
      numIdleProcesses: 1,
    }),
  );
}
