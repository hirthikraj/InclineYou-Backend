/**
 * A PAGE OF SEARCH RESULTS, RE-RANKED FOR A TRAINER (25 Nov 2026).
 *
 * The server orders a search by trigram similarity, which scores *Sandbag overhead press* level with
 * *Barbell overhead press* — so *overhead press* led with the sandbag, in the builder and in the library alike.
 * Within the page the server sent:
 *
 *  1. names that END with the typed phrase — the movement is the last word of a library name (*Barbell back
 *     squat*, *Barbell bent-over row*), and a name that merely starts with it is usually something else
 *     (*Squat thrust*, *Rowing machine*); then names that contain it; then the rest;
 *  2. the kit on every gym floor before specialist kit;
 *  3. the plainer (shorter) name.
 *
 * A stable sort, so the server's order still decides every tie. No `server-only`: both the builder (a client
 * component) and the library page use it, which is the point — one search, one order.
 */
const COMMON_KIT = ['barbell', 'dumbbell', 'cable', 'machine', 'leverage machine', 'smith machine', 'body weight', 'ez bar', 'kettlebell'];

export function rankForTrainer<T extends { name: string; equipment?: string | null }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const kit = (e: string | null | undefined) => {
    const i = COMMON_KIT.indexOf((e ?? '').toLowerCase());
    return i === -1 ? COMMON_KIT.length : i;
  };
  const phrase = (n: string) => {
    const l = n.toLowerCase().replace(/\s*\(.*\)\s*$/, '');
    return l.endsWith(q) ? 0 : l.includes(q) ? 1 : 2;
  };
  return [...rows].sort((a, b) =>
    phrase(a.name) - phrase(b.name) || kit(a.equipment) - kit(b.equipment) || a.name.length - b.name.length);
}
