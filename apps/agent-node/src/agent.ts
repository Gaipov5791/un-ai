import { Agent, dedent, inference, tool } from "@livekit/agents";
import { z } from "zod";
import { KYRGYZ_LANGUAGE_LOCK } from "./kyrgyz.ts";
import { RUSSIAN_LANGUAGE_LOCK } from "./language-lock.ts";
import {
  type AgentLanguage,
  availableSlots,
  book,
  clinicFacts,
  findService,
  isClosedDay,
  resolveDay,
  upcomingDays,
} from "./pilot.ts";

export function createAgent(language: AgentLanguage, reply: "voice" | "text" = "voice") {
  const ky = language === "ky";
  const kyDelivery =
    reply === "text"
      ? "Жообуң экранда жазылат, үн чыкпайт."
      : "Жообуңду үнгө айтасың.";
  return Agent.create({
    llm: new inference.LLM({
      model: ky ? "google/gemini-2.5-flash" : "google/gemma-4-31b-it",
    }),
    instructions: ky
      ? dedent`
          Сен — un-ai үн жардамчысы, Ак-Жол стоматологиясынын ресепшени. Бишкек, Кыргызстан.
          ${kyDelivery} Markdown, тизме жана эмодзи жок.
          ${KYRGYZ_LANGUAGE_LOCK}
          Орусча же англисче сүйлөм кошпо. Тилди ортодо алмаштырба.

          ${clinicFacts("ky")}

          Телефон милдеттүү эмес. Кызмат, күн, саат жана ат бар болсо — book_appointment чакыр.
          Эгер таанылбаган сөз келсе, бир жолу кайтарт. Телефон үчүн request_human чакырба.

          Сценарий:
          1. Кыскача салам айт, эмне керек деп сура.
          2. Жазуу: кызмат, күн, саат, ат. Эртең / дүйшөмбү үчүн list_available_slots чакыр. Датаны куралдан ал, 2025 деп ойлобо.
          3. Жыйынтыкта кызмат, күн, саат, атты кайтала. Андан кийин book_appointment.
          4. FAQ үчүн гана get_clinic_info.
          5. request_human — даттануу, төлөм, ачуулануу үчүн гана.
          6. Жекшемби жана 9:00–18:00дан тышкары «азыр» жазба.
          7. Бир суроо. 1–3 сүйлөм. Сандарды сөз менен айт: «саат он».
        `
      : dedent`
          Ты — голосовой ресепшен стоматологии Ак-Жол.
          Говоришь вслух. Без markdown, списков и эмодзи.
          ${RUSSIAN_LANGUAGE_LOCK}
          Говори только по-русски. Не добавляй кыргызские и английские фразы. Язык посреди звонка не меняй.

          ${clinicFacts("ru")}

          Телефон не обязателен. Есть услуга, день, время и имя — вызывай book_appointment.
          Если распознавание кривое — переспроси один раз. Из-за телефона request_human не вызывай.

          Сценарий:
          1. Коротко поприветствуй и спроси, чем помочь.
          2. Запись: услуга, день, время, имя. На завтра или понедельник вызови list_available_slots. Дату бери из инструмента, не выдумывай 2025.
          3. Перед финалом повтори услугу, дату, время, имя. Потом book_appointment.
          4. FAQ только через get_clinic_info.
          5. request_human только для жалобы, оплаты или злости.
          6. Воскресенье и время вне 9:00–18:00 — не назначай «сейчас».
          7. Один вопрос. 1–3 предложения. Цифры словами: «десять утра».
        `,
    tools: [
      tool({
        name: "get_clinic_info",
        description: ky
          ? "Клиниканын дареги, графиги, телефону жана кызматтары."
          : "Адрес, график, телефон и услуги пилота.",
        parameters: z.object({}),
        execute: async () => clinicFacts(language),
      }),
      tool({
        name: "list_available_slots",
        description: ky ? "Бош слоттор, дата YYYY-MM-DD." : "Свободные слоты на дату YYYY-MM-DD.",
        parameters: z.object({
          day: z.string().describe("Дата YYYY-MM-DD"),
        }),
        execute: async ({ day }) => {
          const resolved = resolveDay(day);
          if (isClosedDay(resolved)) {
            return ky
              ? `${resolved} — эс алуу. Жакынкы күндөр: ${upcomingDays().join(", ")}`
              : `${resolved} — выходной. Ближайшие дни: ${upcomingDays().join(", ")}`;
          }
          const slots = availableSlots(resolved);
          if (slots.length === 0) {
            return ky
              ? `${resolved} күнү бош слот жок. Башка күндөр: ${upcomingDays().join(", ")}`
              : `На ${resolved} свободных слотов нет. Другие дни: ${upcomingDays().join(", ")}`;
          }
          return ky
            ? `Бош ${resolved}: ${slots.join(", ")}`
            : `Свободно ${resolved}: ${slots.join(", ")}`;
        },
      }),
      tool({
        name: "book_appointment",
        description: ky
          ? "Кардарды ырастагандан кийин жаз."
          : "Записать клиента после устного подтверждения.",
        parameters: z.object({
          service: z.string().describe(ky ? "Кызмат: карал, тазалоо, пломба" : "Услуга: осмотр, гигиена, пломба, детский приём"),
          day: z.string().describe("Дата YYYY-MM-DD"),
          time: z.string().describe("Время HH:MM"),
          name: z.string().describe(ky ? "Кардардын аты" : "Имя клиента"),
          phone: z.string().optional().describe(ky ? "Телефон, эгер айтса" : "Телефон, если назвал"),
        }),
        execute: async ({ service, day, time, name, phone }) => {
          const found = findService(service);
          if (!found) {
            return ky
              ? "Мындай кызмат жок. Бар: карал, тазалоо, пломба, балдар карал."
              : "Такой услуги нет. Есть осмотр, гигиена, пломба, детский приём.";
          }
          const resolved = resolveDay(day);
          const result = book(found.id, resolved, time, name, phone ?? "");
          if (result === "ok") {
            return ky
              ? `Жазуу чыкты: ${found.nameKy}, ${resolved} ${time}, ${name}. Муну кардарга айт.`
              : `Запись создана: ${found.nameRu}, ${resolved} ${time}, ${name}. Повтори это клиенту.`;
          }
          if (result === "closed") return ky ? "Бул күн эс алуу." : "Этот день выходной.";
          if (result === "taken") {
            return ky
              ? `${time} бош эмес. list_available_slots менен башка саат сура.`
              : `Слот ${time} занят. Спроси другой из list_available_slots.`;
          }
          if (result === "bad_time") {
            return ky
              ? "Мындай саат жок. list_available_slots гана."
              : "Такого часа нет. Только слоты из list_available_slots.";
          }
          return ky ? "Жазуу болгон жок." : "Не удалось записать.";
        },
      }),
      tool({
        name: "request_human",
        description: ky
          ? "Кызматкерге өткөр: даттануу, төлөм."
          : "Заявка сотруднику: жалоба, оплата.",
        parameters: z.object({
          reason: z.string().describe(ky ? "Эмне үчүн адам керек" : "Почему нужен человек"),
        }),
        execute: async ({ reason }) => {
          console.log("human requested:", reason);
          return ky
            ? "Кызматкерге өтүнүч кетти. Кардарга кайра чалышат деп айт. Дарыгердин атын ойлоп чыгарба."
            : "Заявка сотруднику создана. Скажи клиенту, что с ним свяжутся. Не выдумывай имя врача.";
        },
      }),
    ],
  });
}
