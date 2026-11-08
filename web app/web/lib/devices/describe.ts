/**
 * "Chrome on Android" from a User-Agent header — what the signed-in devices list shows for each browser.
 *
 * The backend stores the header as it arrived (`web_session.user_agent`) and names nothing, so the words are made here. Pure
 * and loose on purpose: it only has to let a person recognise their own phone in a list of three, not identify a browser.
 * Order matters — Edge and Opera also say "Chrome", Chrome also says "Safari", and an iPad may say "Macintosh".
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (!ua.trim()) return 'Unknown browser';

  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';

  const os =
    /Android/.test(ua) ? 'Android'
    : /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Linux/.test(ua) ? 'Linux'
    : null;

  return os ? `${browser} on ${os}` : browser;
}

/** "Active now", "12 minutes ago", "3 days ago", or a date — for when a device was last used. */
export function lastSeenLabel(epochMs: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - epochMs) / 60_000);
  if (minutes < 5) return 'Active now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return dateLabel(epochMs);
}

/** "8 Nov 2026", in India's time zone, which is where every user of this product is. */
export function dateLabel(epochMs: number): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .format(new Date(epochMs));
}
