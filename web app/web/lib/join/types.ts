/**
 * THE JOIN LINK'S WIRE — api-contract 1.2, jl-a1…jl-a5 and jn-a1…jn-a3 (V45).
 *
 * Types and plain constants only, with no `server-only`: the settings screen, the requests list and the public page are client
 * components and all read this vocabulary (trap 18).
 */

/**
 * A join-page question IS an assessment question (22 Nov 2026): the same four kinds — yes/no, rating, text, multiple choice
 * — written with the shared `QuestionBuilder` and answered with the shared `QuestionAnswer`. `required` is the join page's
 * own; an assessment has none.
 */
export interface JoinQuestion {
  id: string;
  text: string;
  kind: 'yesno' | 'rating' | 'text' | 'choice';
  scale: number | null;
  options: { id: string; text: string }[];
  allowMultiple: boolean;
  allowCustom: boolean;
  required: boolean;
}

/** One answer on the wire: the question's id and the shared `AnswerWire` fields. */
export interface JoinAnswer {
  questionId: string;
  yes?: boolean;
  rating?: number;
  text?: string;
  optionIds?: string[];
}

/** jl-a1 — the active workspace's link. `exists: false` is the defaults, with a suggested slug. */
export interface JoinLinkWire {
  exists: boolean;
  slug: string;
  url: string;
  takingJoins: boolean;
  welcomeLine: string | null;
  questions: JoinQuestion[];
  packIds: string[];
  allowNoPlan: boolean;
  welcomeMessage: string | null;
  checkInTemplateId: string | null;
  updatedAt: number | null;
}

/** jl-a2 — the whole form, one Save. */
export interface JoinLinkWrite {
  slug: string;
  takingJoins: boolean;
  welcomeLine: string | null;
  questions: JoinQuestion[];
  packIds: string[];
  allowNoPlan: boolean;
  welcomeMessage: string | null;
  checkInTemplateId: string | null;
}

export type JoinRequestStatus = 'pending' | 'approved' | 'declined';

/** jl-a3 — one request. An approved one carries only its client: the person moved to the client row. */
export interface JoinRequestWire {
  id: string;
  status: JoinRequestStatus;
  name: string | null;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  plan: { id: string; name: string; amount: string; currency: string; offered: boolean } | null;
  answers: { label: string; answer: string | null }[];
  whatsappReminders: boolean;
  createdAt: number;
  decidedAt: number | null;
  clientId: string | null;
}

export interface JoinRequestListWire {
  items: JoinRequestWire[];
  counts: { pending: number; approved: number; declined: number };
}

/** jn-a1 — the public page. `closed` carries nothing else. */
export interface JoinPlanWire {
  id: string;
  name: string;
  service: 'floor' | 'home_visit' | 'remote' | 'programming';
  basis: 'sessions' | 'period';
  sessions: number | null;
  validityDays: number | null;
  amount: string;
  currency: string;
}

export type JoinCardWire =
  | { state: 'closed' }
  | {
      state: 'open';
      welcomeLine?: string | null;
      questions: JoinQuestion[];
      plans: JoinPlanWire[];
      allowNoPlan: boolean;
      trainer: {
        name: string;
        headline: string | null;
        bio: string | null;
        introVideoId: string | null;
        certifications: string[];
        specialities: string[];
        languages: string[];
        instagramHandle: string | null;
        youtubeHandle: string | null;
      };
      policyVersion: string;
      privacySummary: string[];
    };

/** The caps the server refuses past (V45, `JoinLinkService`). Mirrored so the form counts down instead of failing on Save. */
export const JOIN_LIMITS = {
  welcomeLine: 200,
  welcomeMessage: 1000,
  questions: 15,
  questionLabel: 200,
  options: 10,
  option: 80,
  plans: 12,
  answer: 1000,
} as const;

/** The slug the server takes: 3–40, a–z 0–9 and single hyphens, not at either end. */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return 'At least 3 characters.';
  if (slug.length > 40) return 'At most 40 characters.';
  if (!SLUG.test(slug) || slug.includes('--')) return 'Small letters, numbers and single hyphens only, not at either end.';
  return null;
}

const SERVICE: Record<JoinPlanWire['service'], string> = {
  floor: 'In person',
  home_visit: 'Home visits',
  remote: 'Online',
  programming: 'Programming only',
};

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export function money(amount: string, currency = 'INR'): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return currency === 'INR'
    ? INR.format(n)
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

/** "12 sessions · In person · 60 days" — what a plan is, in one line. */
export function planLine(p: Pick<JoinPlanWire, 'name' | 'service' | 'basis' | 'sessions' | 'validityDays'>): string {
  const parts: string[] = [];
  const count = p.basis === 'sessions' && p.sessions ? `${p.sessions} session${p.sessions === 1 ? '' : 's'}` : null;
  // "8 sessions" named "8 sessions" would say it twice.
  if (count && !p.name.toLowerCase().includes(count.toLowerCase())) parts.push(count);
  parts.push(SERVICE[p.service]);
  if (p.validityDays) parts.push(p.basis === 'period' ? `${p.validityDays} days` : `valid ${p.validityDays} days`);
  return parts.join(' · ');
}
