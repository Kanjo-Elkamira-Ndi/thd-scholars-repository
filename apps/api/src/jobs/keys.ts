import { env } from '../config/env';

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const calendarDateInTimeZone = (date: Date, timeZone: string): CalendarDate => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
};

export const quarterKey = (date: Date = new Date(), timeZone: string = env.JOBS_TIMEZONE): string => {
  const { year, month } = calendarDateInTimeZone(date, timeZone);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
};

export const weekKey = (date: Date = new Date(), timeZone: string = env.JOBS_TIMEZONE): string => {
  const { year, month, day } = calendarDateInTimeZone(date, timeZone);
  const target = new Date(Date.UTC(year, month - 1, day));
  const isoDay = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - isoDay + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstIsoDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstIsoDay + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
};
