import type { ISODate, MonthKey } from '@/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function isValidISO(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(parseISO(iso).getTime());
}

export function monthKeyOf(iso: string): MonthKey {
  return iso.slice(0, 7);
}

export function currentMonthKey(): MonthKey {
  return monthKeyOf(todayISO());
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthStart(key: MonthKey): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: MonthKey): ISODate {
  return `${key}-${pad(daysInMonth(key))}`;
}

export function monthLabel(key: MonthKey, style: 'long' | 'short' = 'long'): string {
  return parseISO(`${key}-01`).toLocaleDateString('en-GB', { month: style, year: 'numeric' });
}

export function monthName(key: MonthKey): string {
  return parseISO(`${key}-01`).toLocaleDateString('en-GB', { month: 'long' });
}

/** "13 Oct" */
export function formatShort(iso: string): string {
  if (!iso) return '—';
  return parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Tue, 13 Oct 2026" */
export function formatLong(iso: string): string {
  if (!iso) return 'No date';
  return parseISO(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "13/10/2026" spreadsheet style */
export function formatSheet(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function weekdayShort(iso: string): string {
  return parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short' });
}

export function relativeDay(iso: string): string {
  if (!iso) return '';
  const diff = diffDays(todayISO(), iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/** Monday-first week start for a given date. */
export function startOfWeek(iso: ISODate): ISODate {
  const d = parseISO(iso);
  const day = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - day);
  return toISO(d);
}

export function weekDays(iso: ISODate): ISODate[] {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6×7 grid of dates covering the month (Monday first). */
export function monthGrid(key: MonthKey): ISODate[] {
  const first = startOfWeek(monthStart(key));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  // Trim a trailing week that's entirely in the next month.
  const lastRowStart = cells[35];
  if (monthKeyOf(lastRowStart) !== key) return cells.slice(0, 35);
  return cells;
}

export function isoWeekNumber(iso: ISODate): number {
  const d = parseISO(iso);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY. */
export function parseLooseDate(input: string): ISODate | '' {
  const v = input.trim();
  if (!v) return '';
  if (isValidISO(v)) return v;
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return isValidISO(iso) ? iso : '';
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : toISO(d);
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
