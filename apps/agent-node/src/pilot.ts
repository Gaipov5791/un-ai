export type Service = {
  id: string;
  nameKy: string;
  nameRu: string;
  durationMin: number;
  priceKgs: number;
};

export type Booking = {
  serviceId: string;
  day: string;
  time: string;
  name: string;
  phone: string;
};

export const CLINIC = {
  nameKy: "Ак-Жол стоматология",
  nameRu: "Стоматология Ак-Жол",
  address: "Бишкек, микрорайон Джал, улица Ахунбаева, 92",
  hoursKy: "Дүйшөмбүдөн ишембиге чейин, таңкы тогуздан кечки алтыга чейин. Жекшемби эс алуу.",
  hoursRu: "Понедельник–суббота, с 9:00 до 18:00. Воскресенье — выходной.",
  phone: "+996 555 100 200",
};

export const SERVICES: Service[] = [
  { id: "consult", nameKy: "карал", nameRu: "осмотр", durationMin: 30, priceKgs: 800 },
  { id: "hygiene", nameKy: "тазалоо", nameRu: "гигиена", durationMin: 45, priceKgs: 2500 },
  { id: "fill", nameKy: "пломба", nameRu: "пломба", durationMin: 60, priceKgs: 3500 },
  { id: "kids", nameKy: "балдар карал", nameRu: "детский приём", durationMin: 30, priceKgs: 1000 },
];

const OPEN_HOURS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
const WEEKDAYS_RU = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];
const WEEKDAYS_KY = [
  "жекшемби",
  "дүйшөмбү",
  "шейшемби",
  "шаршемби",
  "бейшемби",
  "жума",
  "ишемби",
];
const bookings: Booking[] = [];

export function localDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextWeekday(target: number): string {
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  const delta = (target - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + delta);
  return localDate(cursor);
}

export function resolveDay(raw: string): string {
  const query = raw.trim().toLowerCase();
  if (query === "сегодня" || query === "бүгүн") return localDate();
  if (query === "завтра" || query === "эртең") {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDate(tomorrow);
  }
  for (let weekday = 0; weekday < 7; weekday += 1) {
    if (query.includes(WEEKDAYS_RU[weekday]) || query.includes(WEEKDAYS_KY[weekday])) {
      return nextWeekday(weekday);
    }
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    if (year < new Date().getFullYear()) {
      return nextWeekday(new Date(`${raw}T12:00:00`).getDay());
    }
    return raw;
  }
  return upcomingDays()[0] ?? localDate();
}

export type AgentLanguage = "ky" | "ru";

export function clinicFacts(language: AgentLanguage = "ru"): string {
  const today = new Date();
  if (language === "ky") {
    const services = SERVICES.map(
      (s) => `${s.nameKy} — ${s.priceKgs} сом, ${s.durationMin} мүнөт`,
    ).join("; ");
    return [
      `Клиника: ${CLINIC.nameKy}.`,
      `Дарек: ${CLINIC.address}.`,
      `Иш графиги: ${CLINIC.hoursKy}.`,
      `Телефон: ${CLINIC.phone}.`,
      `Кызматтар: ${services}.`,
      `Бүгүн ${localDate(today)}, ${WEEKDAYS_KY[today.getDay()]}.`,
      `Жакынкы иш күндөрү: ${upcomingDays().join(", ")}.`,
      "Башка баа, дарыгер жана слот жок. Ойлоп чыгарба. Жыл — 2026.",
    ].join(" ");
  }
  const services = SERVICES.map(
    (s) => `${s.nameRu} — ${s.priceKgs} сом, ${s.durationMin} мин`,
  ).join("; ");
  return [
    `Клиника: ${CLINIC.nameRu}.`,
    `Адрес: ${CLINIC.address}.`,
    `График: ${CLINIC.hoursRu}.`,
    `Телефон: ${CLINIC.phone}.`,
    `Услуги: ${services}.`,
    `Сегодня ${localDate(today)}, ${WEEKDAYS_RU[today.getDay()]}.`,
    `Ближайшие рабочие дни: ${upcomingDays().join(", ")}.`,
    "Других цен, врачей и слотов нет. Не выдумывать. Год только 2026.",
  ].join(" ");
}

export function findService(query: string): Service | undefined {
  const q = query.trim().toLowerCase();
  return SERVICES.find(
    (s) =>
      q === s.id ||
      q === s.nameKy.toLowerCase() ||
      q === s.nameRu.toLowerCase() ||
      s.nameKy.toLowerCase().includes(q) ||
      s.nameRu.toLowerCase().includes(q),
  );
}

export function isClosedDay(day: string): boolean {
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getDay() === 0;
}

export function upcomingDays(): string[] {
  const days: string[] = [];
  const cursor = new Date();
  while (days.length < 3) {
    if (cursor.getDay() !== 0) {
      days.push(localDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function availableSlots(day: string): string[] {
  const taken = new Set(bookings.filter((b) => b.day === day).map((b) => b.time));
  return OPEN_HOURS.filter((slot) => !taken.has(slot));
}

export function book(
  serviceId: string,
  day: string,
  time: string,
  name: string,
  phone: string,
): string {
  const service = findService(serviceId);
  if (!service) return "unknown_service";
  if (isClosedDay(day)) return "closed";
  if (!OPEN_HOURS.includes(time)) return "bad_time";
  if (bookings.some((b) => b.day === day && b.time === time)) return "taken";
  bookings.push({
    serviceId: service.id,
    day,
    time,
    name: name.trim(),
    phone: phone.trim(),
  });
  return "ok";
}
