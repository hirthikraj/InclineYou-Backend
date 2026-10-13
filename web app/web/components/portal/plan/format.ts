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
