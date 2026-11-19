import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import { describe, it } from "node:test";
import {
  enforceLanguageLock,
  KY_LANGUAGE_REASK,
  RU_LANGUAGE_REASK,
  isWrongLanguage,
  lockLanguageForTts,
} from "./language-lock.ts";
import { availableSlots, book, findService } from "./pilot.ts";

async function collect(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  return text;
}

function streamOf(text: string, chunkSize = 4): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (let index = 0; index < text.length; index += chunkSize) {
        controller.enqueue(text.slice(index, index + chunkSize));
      }
      controller.close();
    },
  });
}

describe("language lock", () => {
  it("flags a Russian-only reply in a ky call", () => {
    assert.equal(isWrongLanguage("Здравствуйте. Чем могу помочь?", "ky"), true);
    assert.equal(isWrongLanguage("Конечно, запишу вас на осмотр.", "ky"), true);
    assert.equal(isWrongLanguage("Подскажите ваше имя, пожалуйста.", "ky"), true);
  });

  it("keeps Kyrgyz-only replies and rejects mix", () => {
    assert.equal(
      isWrongLanguage("Саламатсызбы. Ак-Жол стоматологиясы. Кандай жардам бере алам?", "ky"),
      false,
    );
    assert.equal(isWrongLanguage("Эртең саат ондо каралга жаздыралы. Атыңыз ким?", "ky"), false);
    assert.equal(isWrongLanguage("Ооба. Жазуу чыкты.", "ky"), false);
    assert.equal(isWrongLanguage("Саламатсызбы. Конечно.", "ky"), true);
  });

  it("flags a Kyrgyz-only reply in a ru call", () => {
    assert.equal(isWrongLanguage("Саламатсызбы. Кандай жардам бере алам?", "ru"), true);
    assert.equal(isWrongLanguage("Эртең саат ондо жаздыралы.", "ru"), true);
  });

  it("keeps Russian replies", () => {
    assert.equal(isWrongLanguage("Здравствуйте. Стоматология Ак-Жол. Чем помочь?", "ru"), false);
    assert.equal(isWrongLanguage("Запишу вас на осмотр завтра в десять.", "ru"), false);
  });

  it("replaces leaked speech with the existing re-ask", () => {
    assert.equal(enforceLanguageLock("Здравствуйте, запишу вас.", "ky"), KY_LANGUAGE_REASK);
    assert.equal(enforceLanguageLock("Саламатсызбы. Ооба.", "ru"), RU_LANGUAGE_REASK);
    assert.equal(enforceLanguageLock("Саламатсызбы. Кандай жардам?", "ky"), "Саламатсызбы. Кандай жардам?");
    assert.equal(enforceLanguageLock("Саламатсызбы. Конечно.", "ky"), KY_LANGUAGE_REASK);
  });
});

describe("tts language lock stream", () => {
  it("replaces a streamed Russian reply before ky TTS", async () => {
    const spoken = await collect(lockLanguageForTts("ky")(streamOf("Здравствуйте, конечно запишу.")));
    assert.equal(spoken, KY_LANGUAGE_REASK);
  });

  it("passes a Kyrgyz reply through", async () => {
    const source = "Саламатсызбы. Кандай жардам бере алам?";
    const spoken = await collect(lockLanguageForTts("ky")(streamOf(source)));
    assert.equal(spoken, source);
  });
});

describe("in-memory booking", () => {
  it("still books a slot", () => {
    const service = findService("карал");
    assert.ok(service);
    const day = "2026-12-15";
    assert.ok(availableSlots(day).includes("10:00"));
    assert.equal(book(service.id, day, "10:00", "Айбек", ""), "ok");
    assert.equal(book(service.id, day, "10:00", "Айбек", ""), "taken");
  });
});
