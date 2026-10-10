/**
 * Date helpers. All day boundaries are UTC days: "2026-10-03" means
 * 2026-10-03T00:00:00Z up to (not including) 2026-10-04T00:00:00Z. The
 * platforms report daily insights in their own (Pacific / UTC) days, so a
 * day here can be off by a few hours from Jakarta time — fine for trends.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysUTC(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Unix seconds at the start of a UTC day. */
export function unixDayStart(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
}

export function eachDay(since: string, until: string): string[] {
  const out: string[] = [];
  for (let d = since; d <= until; d = addDaysUTC(d, 1)) out.push(d);
  return out;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function unixToISO(sec: number): string {
  return new Date(sec * 1000).toISOString();
}
