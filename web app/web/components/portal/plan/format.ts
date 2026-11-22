/** Dates and times for the client's own screens: a date-only value is a calendar day and is never shifted by the browser's zone. */
export function day(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', opts);
}

export function when(ms: number, zone: string): { day: string; time: string } {
  const d = new Date(ms);
  return {
    day: new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(d),
    time: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(d).toLowerCase(),
  };
}

export function num(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(Number(n.toFixed(2)));
}

/** `yyyy-MM-dd` of an instant in the client's zone — for comparing calendar days. */
function dayKey(ms: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(ms));
}

/** *Today*, *Tomorrow*, or the short date — the word a person would use (Home's own rule). */
export function dayWord(ms: number, now: number, zone: string): string {
  const k = dayKey(ms, zone);
  if (k === dayKey(now, zone)) return 'Today';
  if (k === dayKey(now + 86_400_000, zone)) return 'Tomorrow';
  return when(ms, zone).day;
}
