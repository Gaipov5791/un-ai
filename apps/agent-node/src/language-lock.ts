import { ReadableStream } from "node:stream/web";
import type { AgentLanguage } from "./pilot.ts";

/** Short re-ask already used in ky prompts — spoken if the model answers in Russian. */
export const KY_LANGUAGE_REASK = "Кечиресиз, кыргызча кайталаңызчы.";

/** Symmetric re-ask if a ru session slips into Kyrgyz. */
export const RU_LANGUAGE_REASK = "Извините, повторите, пожалуйста, по-русски.";

export const RUSSIAN_LANGUAGE_LOCK = `
Language lock: you speak only Russian in this call. The caller chose Russian for the whole session.
Do not insert Kyrgyz words or greetings: саламатсызбы, кечиресиз, ооба, жок, жакшы, рахмат, кандай, бүгүн, эртең, жаздырыңыз, каралга, тазалоо, атыңыз.
Do not switch language mid-call. Do not mix ky and ru in one sentence.
If you start answering in Kyrgyz, stop and say only: «${RU_LANGUAGE_REASK}»
`.trim();

const RU_LEAK = [
  "здравствуйте",
  "добрый день",
  "доброе утро",
  "добрый вечер",
  "конечно",
  "запишу",
  "запишем",
  "записаться",
  "подскажите",
  "подскажу",
  "пожалуйста",
  "извините",
  "простите",
  "спасибо",
  "хорошо",
  "давайте",
  "чем помочь",
  "чем могу",
  "вас зовут",
  "меня зовут",
  "свободн",
  "выходной",
  "осмотр",
] as const;

const KY_LEAK = [
  "саламатсызбы",
  "кечиресиз",
  "ооба",
  "жакшы",
  "рахмат",
  "кандай",
  "бүгүн",
  "эртең",
  "жаздыр",
  "тазалоо",
  "кайталаңыз",
  "кыргызча",
  "атыңыз",
  "дүйшөмбү",
  "ишемби",
  "жекшемби",
  "каралга",
] as const;

function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\p{L})${escaped}`, "iu").test(text);
}

function hasAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => hasPhrase(text, phrase));
}

/** True when the reply contains the other language. Mix is not accepted in milestone B. */
export function isWrongLanguage(text: string, language: AgentLanguage): boolean {
  const normalized = text.toLowerCase();
  if (language === "ky") {
    return hasAny(normalized, RU_LEAK);
  }
  return hasAny(normalized, KY_LEAK);
}

export function enforceLanguageLock(text: string, language: AgentLanguage): string {
  if (!text.trim()) return text;
  if (!isWrongLanguage(text, language)) return text;
  return language === "ky" ? KY_LANGUAGE_REASK : RU_LANGUAGE_REASK;
}

/** Buffer the LLM reply, then drop a leaked-language utterance before TTS. */
export function lockLanguageForTts(language: AgentLanguage) {
  return (text: ReadableStream<string>) =>
    new ReadableStream<string>({
      async start(controller) {
        const reader = text.getReader();
        let buffer = "";
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;
          }
          const spoken = enforceLanguageLock(buffer, language);
          if (spoken !== buffer) {
            console.warn("un-ai: language lock replaced reply", language);
          }
          if (spoken) controller.enqueue(spoken);
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
}
