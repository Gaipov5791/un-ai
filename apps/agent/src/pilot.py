"""Пилот вехи B: одна клиника, данные только из этой базы."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from threading import Lock


@dataclass
class Service:
    id: str
    name_ky: str
    name_ru: str
    duration_min: int
    price_kgs: int


@dataclass
class Booking:
    service_id: str
    day: str
    time: str
    name: str
    phone: str


CLINIC = {
    "name_ky": "Ак-Жол стоматология",
    "name_ru": "Стоматология Ак-Жол",
    "address_ky": "Бишкек, микрорайон Джал, улица Ахунбаева, 92",
    "address_ru": "Бишкек, микрорайон Джал, улица Ахунбаева, 92",
    "hours_ky": "Дүйшөмбүдөн ишембиге чейин, таңкы тогуздан кечки алтыга чейин. Жекшемби эс алуу.",
    "hours_ru": "Понедельник–суббота, с 9:00 до 18:00. Воскресенье — выходной.",
    "phone": "+996 555 100 200",
}

SERVICES = [
    Service("consult", "карал", "осмотр", 30, 800),
    Service("hygiene", "тазалоо", "гигиена", 45, 2500),
    Service("fill", "пломба", "пломба", 60, 3500),
    Service("kids", "балдар карал", "детский приём", 30, 1000),
]

OPEN_HOURS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
WEEKEND_WEEKDAY = 6  # Sunday

_bookings: list[Booking] = []
_lock = Lock()


def clinic_facts() -> str:
    services = "; ".join(
        f"{s.name_ru} / {s.name_ky} — {s.price_kgs} сом, {s.duration_min} мин"
        for s in SERVICES
    )
    return (
        f"Клиника: {CLINIC['name_ru']} ({CLINIC['name_ky']}). "
        f"Адрес: {CLINIC['address_ru']}. "
        f"График: {CLINIC['hours_ru']}. "
        f"Телефон: {CLINIC['phone']}. "
        f"Услуги: {services}. "
        "Других цен, врачей и слотов нет. Не выдумывать."
    )


def find_service(query: str) -> Service | None:
    q = query.strip().lower()
    for service in SERVICES:
        if q in {
            service.id,
            service.name_ky.lower(),
            service.name_ru.lower(),
        } or q in service.name_ky.lower() or q in service.name_ru.lower():
            return service
    return None


def available_slots(day: str) -> list[str]:
    with _lock:
        taken = {b.time for b in _bookings if b.day == day}
    return [slot for slot in OPEN_HOURS if slot not in taken]


def is_closed_day(day: str) -> bool:
    try:
        parsed = date.fromisoformat(day)
    except ValueError:
        return False
    return parsed.weekday() == WEEKEND_WEEKDAY


def book(service_id: str, day: str, time: str, name: str, phone: str) -> str:
    service = find_service(service_id)
    if service is None:
        return "unknown_service"
    if is_closed_day(day):
        return "closed"
    if time not in OPEN_HOURS:
        return "bad_time"
    with _lock:
        if any(b.day == day and b.time == time for b in _bookings):
            return "taken"
        _bookings.append(
            Booking(
                service_id=service.id,
                day=day,
                time=time,
                name=name.strip(),
                phone=phone.strip(),
            )
        )
    return "ok"


def upcoming_days() -> list[str]:
    today = date.today()
    days: list[str] = []
    cursor = today
    while len(days) < 3:
        if cursor.weekday() != WEEKEND_WEEKDAY:
            days.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return days
