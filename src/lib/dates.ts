const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

export function nextWeekday(name: string, from = new Date()): Date {
  const weekday = WEEKDAYS[name.toLowerCase()];
  if (weekday === undefined) throw new Error(`Unknown weekday: ${name}`);
  const result = new Date(from);
  result.setUTCHours(23, 59, 59, 999);
  let delta = (weekday - result.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  result.setUTCDate(result.getUTCDate() + delta);
  return result;
}

export function inferObjectiveDueDate(text: string, now = new Date()): Date {
  const explicit = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return new Date(`${explicit[1]}T23:59:59.999Z`);
  for (const day of Object.keys(WEEKDAYS)) {
    if (new RegExp(`\\b${day}\\b`, "i").test(text)) return nextWeekday(day, now);
  }
  return nextWeekday("friday", now);
}

function dateAtLocalTime(date: string, timeZone: string, hour: number, minute: number, second: number, millisecond: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const noonGuess = new Date(Date.UTC(year, month - 1, day, 12));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(noonGuess);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  const zoneOffset = representedAsUtc - noonGuess.getTime();
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - zoneOffset);
}

export const dateAtLocalNoon = (date: string, timeZone: string) => dateAtLocalTime(date, timeZone, 12, 0, 0, 0);
export const dateAtLocalEndOfDay = (date: string, timeZone: string) => dateAtLocalTime(date, timeZone, 23, 59, 59, 999);
