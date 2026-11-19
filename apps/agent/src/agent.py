from __future__ import annotations

import logging
import os
import textwrap

from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    TurnHandlingOptions,
    cli,
    function_tool,
    inference,
)

from pilot import (
    available_slots,
    book,
    clinic_facts,
    find_service,
    is_closed_day,
    upcoming_days,
)

logger = logging.getLogger("un-ai")

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / ".env.local")
load_dotenv()

AGENT_NAME = os.getenv("UNAI_AGENT_NAME", "un-ai-receptionist")


class Receptionist(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=textwrap.dedent(
                f"""
                Сен — un-ai үн жардамчысы, клиниканын ресепшени.
                Ты — голосовой ресепшен клиники. Говоришь вслух, без markdown, списков и эмодзи.

                {clinic_facts()}

                Язык:
                - Если клиент говорит по-кыргызски — отвечай по-кыргызски.
                - Если по-русски — по-русски.
                - Если смесь (ооба / жакшы / жазып коёлу) — отвечай на языке последней фразы клиента, можно оставлять те же слова.
                - Никогда не подменяй устойчивый кыргызский вход русским ответом.

                Сценарий:
                1. Коротко поприветствуй от имени Ак-Жол и спроси, чем помочь.
                2. Запись: услуга, день, время, имя. Телефон спроси, если клиент не назвал.
                3. Перед финалом повтори вслух: услуга, дата, время, имя. Потом вызови book_appointment.
                4. FAQ: отвечай только фактами клиники. Нет данных — так и скажи, предложи запись или сотрудника.
                5. Оплата, жалоба, злость, два неуспешных уточнения подряд — request_human.
                6. Воскресенье и время вне 9:00–18:00 — не назначай «сейчас». Предложи ближайший рабочий слот или заявку.
                7. Один вопрос за раз. 1–3 предложения.
                """
            )
        )

    @function_tool
    async def get_clinic_info(self, context: RunContext) -> str:
        """Вернуть адрес, график, телефон и услуги пилота. Других фактов нет."""
        return clinic_facts()

    @function_tool
    async def list_available_slots(self, context: RunContext, day: str) -> str:
        """Свободные слоты на дату YYYY-MM-DD."""
        if is_closed_day(day):
            return f"{day} — выходной. Ближайшие дни: {', '.join(upcoming_days())}"
        slots = available_slots(day)
        if not slots:
            return f"На {day} свободных слотов нет. Другие дни: {', '.join(upcoming_days())}"
        return f"Свободно {day}: {', '.join(slots)}"

    @function_tool
    async def book_appointment(
        self,
        context: RunContext,
        service: str,
        day: str,
        time: str,
        name: str,
        phone: str = "",
    ) -> str:
        """Записать клиента после устного подтверждения."""
        found = find_service(service)
        if found is None:
            return "Такой услуги нет. Есть осмотр, гигиена, пломба, детский приём."
        result = book(found.id, day, time, name, phone)
        if result == "ok":
            logger.info("booked %s %s %s %s", found.id, day, time, name)
            return (
                f"Запись создана: {found.name_ru} / {found.name_ky}, {day} {time}, {name}. "
                "Повтори это клиенту."
            )
        if result == "closed":
            return "Этот день выходной."
        if result == "taken":
            return f"Слот {time} занят. Спроси другой из list_available_slots."
        if result == "bad_time":
            return "Такого часа нет. Только слоты из list_available_slots."
        return "Не удалось записать."

    @function_tool
    async def request_human(self, context: RunContext, reason: str) -> str:
        """Заявка живому сотруднику: жалоба, оплата, неуверенность."""
        logger.info("human requested: %s", reason)
        return (
            "Заявка сотруднику создана. Скажи клиенту, что с ним свяжутся. "
            "Не выдумывай имя врача."
        )


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def receptionist_session(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name, "agent": AGENT_NAME}

    session = AgentSession(
        stt=inference.STT(model="deepgram/nova-3", language="multi"),
        llm=inference.LLM(model="google/gemma-4-31b-it"),
        tts=inference.TTS(model="inworld/inworld-tts-2", voice="Ashley"),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
        ),
    )

    await session.start(agent=Receptionist(), room=ctx.room)
    await ctx.connect()
    await session.generate_reply(
        instructions=(
            "Поприветствуй коротко на русском и сразу скажи, "
            "что можно говорить по-кыргызски же. Спроси, чем помочь."
        )
    )


if __name__ == "__main__":
    cli.run_app(server)
