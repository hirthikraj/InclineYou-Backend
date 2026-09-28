'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import type { NewClientData, WorkingHourWire, ClientScheduleWire } from '@/lib/clients/new-api';
import {
  checkPhone,
  createClient,
  saveSchedule,
  sellPack,
  updateClientDetails,
  applyTemplate,
  type WeeklySlot,
} from '@/lib/clients/new-actions';
import { Glyph } from '@/components/shell/Icons';
import { avatarToken, initials, rupees } from '@/lib/today/time';
import { packSubtitle, type Pack } from '@/lib/setup/money';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { Chip } from '@/web-components/ui/Chip';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { ListRow, ListRowNumber } from '@/web-components/ui/ListRow';
import { EmptyState } from '@/web-components/ui/EmptyState';

/* ─────────────────────────────────────────────────── icons ── */

function XIcon() {
  return <Glyph size={15} d="M18 6L6 18M6 6l12 12" />;
}

function ArrowIcon() {
  return (
    <span className="adarrow" style={{ display: 'inline-flex' }}>
      <Glyph size={14} d="M5 12h13m-5-6 6 6-6 6" />
    </span>
  );
}

function PackIcon({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M19 8V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="17" />
    </Glyph>
  );
}

/* ───────────────────────────────────────── the ridge, as geometry ──

   Four rungs climbing left to right inside a fixed 472×46 viewBox. The SVG is
   drawn at width:100% with the box unchanged, so it scales uniformly with the
   drawer (512px on desktop, the whole screen under 900px) and every number
   below stays a constant. The trace carries pathLength="100", which turns the
   draw into a straight percentage — see the CSS.

   THE BOX IS TIGHTER THAN THE CLIMBER, ON PURPOSE. Its pulsing halo is ~26px
   across and the climb itself spends 27 of the 46, so a box that contained the
   halo at both ends would be ~60px — 14px of a 512px drawer's head bought to
   hold air at the two rungs where the halo is not. `.ascent__ridge` is
   `overflow:visible` instead and the halo paints over the margin above and the
   label row below, both of which are empty where it lands; the BAND still
   clips, so nothing escapes the dark plate.                                */

const RUNG_X = [59, 177, 295, 413];
const RUNG_Y = [33, 24, 15, 6];
const RIDGE_PATH = RUNG_X.map((x, i) => `${x},${RUNG_Y[i]}`).join(' ');
const BASE_Y = 45;

/** Where the climber sits for a progress fraction in [0,1]. */
function climberAt(p: number): { x: number; y: number } {
  const span = Math.min(Math.max(p, 0), 1) * (RUNG_X.length - 1);
  const i = Math.min(Math.floor(span), RUNG_X.length - 2);
  const t = span - i;
  return {
    x: RUNG_X[i] + (RUNG_X[i + 1] - RUNG_X[i]) * t,
    y: RUNG_Y[i] + (RUNG_Y[i + 1] - RUNG_Y[i]) * t,
  };
}

/* ─────────────────────────────────────────────────── steps ── */

type Step = 1 | 2 | 3 | 4;

const STEP_DEFS = [
  { n: 1 as Step, label: 'Who', optional: false },
  { n: 2 as Step, label: 'Money', optional: false },
  { n: 3 as Step, label: 'Week', optional: true },
  { n: 4 as Step, label: 'Plan', optional: true },
];

/* ─────────────────────────────────────────────────── slot helpers ── */

/**
 * THE ONE PLACE THIS SCREEN CROSSES THE TWO WEEKDAY CONVENTIONS.
 *
 * The chips, and everything this step SAVES, are standing slots — 1 = Monday …
 * 7 = Sunday, which is what `client.weekly_schedule` and `program.schedule` both
 * hold and what `TemplateService.validateSchedule` enforces.
 * `working_hours.weekday` is the other one: 0 = Monday … 6 = Sunday, stated on
 * `WorkingHoursService`'s parameter and read that way by `lib/today/time.ts` and
 * `lib/schedule/grid.ts`.
 *
 * This function was handed the first and looked up the second, so pressing *Mon*
 * offered **Tuesday's** working hours, and *Sun* (7) matched no row at all and
 * could never be picked — a whole weekday the trainer could not schedule
 * anybody on. `lib/clients/booking.ts` states both conventions in one place now;
 * the `- 1` is the translation and it belongs here, at the crossing.
 */
function slotsForDay(weekday: number, hours: WorkingHourWire[]) {
  const hw = hours.find(h => h.weekday === weekday - 1);
  if (!hw) return [];
  const slots: Array<{ minute: number; time: string }> = [];
  for (let m = hw.startMinute; m < hw.endMinute; m += 30) {
    const h = Math.floor(m / 60).toString().padStart(2, '0');
    const min = (m % 60).toString().padStart(2, '0');
    slots.push({ minute: m, time: `${h}:${min}` });
  }
  return slots;
}

function heldBy(weekday: number, time: string, clients: ClientScheduleWire[]): string | null {
  const live = new Set(['active', 'invited']);
  for (const c of clients) {
    if (!live.has((c.status ?? '').toLowerCase())) continue;
    if ((c.weeklySchedule ?? []).some(s => s.weekday === weekday && s.time === time)) return c.name;
  }
  return null;
}

/* ─────────────────────────────────────────────────── phone helpers ── */

function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

function displayPhone(raw: string): string {
  const digits = cleanPhone(raw);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
}

/* ─────────────────────────────────────────────────── work-mode data ── */

const WORK_MODE_INFO: Record<string, { label: string; sub: string; tag: string; tagClass: string }> = {
  independent: {
    label: 'Independent',
    sub: 'They collect. Their own packs, price editable on the sale.',
    tag: 'no split',
    tagClass: 'tag tag--ok',
  },
  gym: {
    label: 'Gym',
    sub: "The counter collects. The gym's list, and one question: their share.",
    tag: 'asks for a share',
    tagClass: 'tag tag--warn',
  },
  both: {
    label: 'Both',
    sub: 'Asks first — gym client, or one of your own?',
    tag: 'asks for a share',
    tagClass: 'tag tag--warn',
  },
};

const ALL_MODES = ['independent', 'gym', 'both'] as const;

type WorkMode = (typeof ALL_MODES)[number];

/** Which of the two price lists a mode puts on screen. */
const LISTS_FOR: Record<WorkMode, { own: boolean; gym: boolean }> = {
  independent: { own: true, gym: false },
  gym: { own: false, gym: true },
  both: { own: true, gym: true },
};

/* ───────────────────────────────────── leaving to set a price list, and back ──

   Step 2 can only draw packs a trainer has already defined, and the screen that
   defines them is `/business/packages` — a different route, which means
   leaving a half-filled form. So the form goes with them.

   `sessionStorage` and not a query string: the draft is a name and a phone
   number, and a phone number does not belong in a URL that lands in history,
   in a shared link or in a server log. It is per-TAB and it dies with the tab,
   which is exactly the lifetime of "I am in the middle of adding someone".

   Both shells come back to `/clients/new` — the route, even when the trainer
   left from the roster's drawer. A drawer is local state on `Clients.tsx` with
   nothing in the URL to reopen it, and the route IS the same flow: the same
   component, the same four steps, the same draft. See `AddClientFlow`'s header
   for why there is one implementation and two shells. */

const DRAFT_KEY = 'incline.add-client.draft';

/** Marks a Business visit as a detour out of this flow, so that screen can draw
 *  the way back. A fixed value rather than a `?next=` path — nothing here reads
 *  a redirect target out of a URL. */
export const PACKS_DETOUR = 'new-client';

interface Draft {
  name: string;
  phone: string;
  deliveryMode: 'floor' | 'remote';
  trainerSplit: number;
  packMode: WorkMode | null;
  /** The pack they picked. Re-checked against the live list on the way back in
   *  — the whole point of the detour is that the price list changed while they
   *  were away, so a retired pack must not survive as a selection. */
  packId: string | null;
}

/**
 * The draft, read through `useSyncExternalStore`.
 *
 * NOT a mount effect and NOT a lazy `useState` initialiser, and the reason is
 * the one `Today.tsx`'s filter chips already record: the effect is a second
 * render pass that React's own lint rule rejects, and the initialiser reads
 * `sessionStorage` during a render this component is SERVER-rendered for, which
 * is a hydration mismatch on the first paint. `getServerSnapshot` answers null,
 * `getSnapshot` reads the real value on the very next render, and the raw
 * string is cached because the contract requires a stable reference.
 *
 * Nothing ever writes the draft while this component is mounted — the write is
 * the last thing that happens before it navigates away — so there is nothing to
 * subscribe TO, and the unsubscribe is the whole of the subscription.
 */
let draftCache: string | null = null;
let draftRead = false;

function subscribeDraft(): () => void {
  return () => {};
}

function draftSnapshot(): string | null {
  if (!draftRead) {
    draftRead = true;
    try {
      draftCache = sessionStorage.getItem(DRAFT_KEY);
    } catch {
      /* Private mode, or a quota. A draft that cannot be read is a form that
         starts empty — never a screen that fails to load. */
      draftCache = null;
    }
  }
  return draftCache;
}

function serverDraftSnapshot(): string | null {
  return null;
}

/**
 * Park the form. Invalidates the cache on the way out, which is the half that
 * is easy to miss: `/clients/new` → `/business` → `/clients/new` is a SOFT
 * navigation, so this module is never re-evaluated and `draftSnapshot` would
 * otherwise go on answering the `null` it cached on the first visit — a draft
 * written and never read.
 */
function writeDraft(draft: Draft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* No draft is still a working detour — the trainer retypes. Failing to save
       must never fail to navigate. */
  }
  draftRead = false;
  draftCache = null;
}

/** Consumed. Marked READ rather than unread, so the next mount in this tab gets
 *  the known-empty answer without a second trip to storage. */
function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Nothing to do and nothing to say — the cache below is what the next read
       answers from either way. */
  }
  draftRead = true;
  draftCache = null;
}

function parseDraft(raw: string): Draft | null {
  try {
    const d = JSON.parse(raw) as Partial<Draft>;
    if (typeof d.name !== 'string' || typeof d.phone !== 'string') return null;
    return {
      name: d.name,
      phone: d.phone,
      deliveryMode: d.deliveryMode === 'remote' ? 'remote' : 'floor',
      trainerSplit:
        typeof d.trainerSplit === 'number' && d.trainerSplit >= 0 && d.trainerSplit <= 100
          ? d.trainerSplit
          : 60,
      packMode:
        d.packMode === 'independent' || d.packMode === 'gym' || d.packMode === 'both'
          ? d.packMode
          : null,
      packId: typeof d.packId === 'string' ? d.packId : null,
    };
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────── a price list, as rows ── */

/**
 * "₹750 a session · 60 days to use it" — what the name does NOT already say.
 *
 * `packSubtitle` and not a fourth spelling of the per-session figure: setup's
 * table, the price list and this row are three places one trainer reads one
 * number, and `lib/setup/options.ts` opens by describing what two spellings of
 * one answer cost. The session COUNT is deliberately not here — `autoName`
 * writes *8 sessions* and *Single session*, so leading with the count printed
 * "Single session · single session", which is the name apologising for itself.
 */
function packDetail(pack: Pack): string {
  return [packSubtitle(pack), pack.validityDays ? `${pack.validityDays} days to use it` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One price list, priced. Read-only on purpose — *Continue* creates the client
 * and the pack is sold on the day they pay, so this answers "what can I offer
 * them" without adding a fifth thing to get wrong before the record exists.
 *
 * `ListRow` and NOT `KeyValueRow`, which is the measurement this screen made:
 * `.kv` is a nowrap key beside a nowrap figure — right for *The gym's share* /
 * *30%*, and a pack is a NAME, a sentence about it and an amount. Drawn as a
 * `.kv` it ran **20px past its card at 390 and 50px at 360**, clipped rather
 * than scrolled because `.main` is `overflow:hidden`, so `documentElement`
 * reported no overflow at all. `/me/plan`'s *Coming up* took the same
 * measurement and the same answer: `.lrow__t` and `.lrow__s` ellipsise, so the
 * row needs no media query at either width.
 *
 * `ListRows` supplies the `role="listbox"` — see that component's own note on
 * why it must not be worn by rows that are statements rather than options.
 * These are statements, so the rows take neither `href` nor `onClick` and the
 * wrapper is a plain `<Card flush>`.
 */
function PriceList({
  packs,
  label,
  pickedId,
  onPick,
}: {
  packs: Pack[];
  label: string;
  pickedId: string | null;
  /** Null clears. Picking in one list clears the other — see `pickPack`. */
  onPick: (id: string | null) => void;
}) {
  return (
    <Card flush>
      {/* `role="group"` and NOT `ListRows`, whose `role="listbox"` is for the
          LINK form only — that component's own header says so, and a listbox
          holding buttons tells a reader they can arrow through a selection
          that does not exist. A list of buttons is a list of buttons. */}
      <div role="group" aria-label={label}>
        {packs.map(pack => {
          const on = pickedId === pack.id;
          return (
            <ListRow
              key={pack.id}
              /* `selected` is `aria-pressed` on the button form, which §04
                 already paints — the fill plus the 2px accent bar — and which
                 is this codebase's settled answer for an exclusive row set:
                 `/packages`' work-mode row and step 4's template list both
                 make it, and `Chip`'s own note gives the reason. Re-pressing
                 the pressed row clears it, so a step that still carries a Skip
                 can be un-answered. */
              selected={on}
              onClick={() => onPick(on ? null : pack.id)}
              avatar={<span className={`rad${on ? ' rad--on' : ''}`} aria-hidden="true" />}
              title={pack.name}
              sub={packDetail(pack)}
              right={<ListRowNumber>{rupees(pack.amount)}</ListRowNumber>}
            />
          );
        })}
      </div>
    </Card>
  );
}

const WEEKDAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
];

/* ───────────────────────────────────────── small presentational bits ── */

/** A mono kicker with a rule running to the right edge, and an optional count. */
function Sec({ k, n }: { k: string; n?: string }) {
  return (
    <div className="adsec">
      <span className="adsec__k">{k}</span>
      <span className="adsec__r" />
      {n && <span className="adsec__n">{n}</span>}
    </div>
  );
}

/* ─────────────────────────────────────────────────── main component ── */

/**
 * The four-step *add a client* flow, and the ONLY implementation of it.
 *
 * There used to be two. `AddClientDrawer` opened from the roster's button and
 * `NewClient` was the `/clients/new` route, ~800 lines each, the same four
 * steps, the same four handlers and the same three server actions — and they
 * had already drifted, which is what a second copy always does:
 *
 *   the page rendered `{' %}'}` — a literal ` %}` after the split field
 *   un-picking a time slot on the page wrote `time: ''` rather than removing
 *     the key, and `handleStep3Continue` then POSTed the empty string
 *   the page had NO way back to a finished step, at any width
 *   its `doPhoneCheck` carried a dead `.find()` that could only return false
 *   applying a template landed on `/clients` instead of the client just made
 *
 * None of those is in the drawer, and every one of them reached a trainer. So
 * the flow is one component and the two surfaces are two SHELLS around it —
 * the call `PackSheet` already makes for setup and `/packages` ("the same
 * question asked at two moments"), and `CertificationPicker` for the setup
 * step and the profile tab.
 *
 * `shell` is the only thing that differs, and it differs in four places: the
 * dialog wrapper, Escape, what the ✕ means, and whether the title is an `<h1>`.
 */
export function AddClientFlow({
  data,
  shell,
  onClose,
}: {
  data: NewClientData;
  /** `drawer` — inside a dialog with a scrim. `page` — the `/clients/new` route. */
  shell: 'drawer' | 'page';
  /** The drawer's dismiss. A page has nowhere to close TO, so it navigates. */
  onClose?: () => void;
}) {
  const router = useRouter();

  /* Leaving without finishing. The drawer dismisses; the route goes back to the
     roster it was opened from. Everything that used to call `onClose` directly
     calls this, so neither shell has a dead control. */
  const cancel = useCallback(() => {
    if (onClose) onClose();
    else router.push('/clients');
  }, [onClose, router]);

  /* form state */
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCheck, setPhoneCheck] = useState<'idle' | 'checking' | 'ok' | 'on-roster' | 'blocked'>('idle');
  const [rosterMatch, setRosterMatch] = useState<{ id: string; name: string } | null>(null);
  const [dismissedRosterWarn, setDismissedRosterWarn] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'floor' | 'remote'>('floor');
  /* Whose packs THIS client buys from, seeded with the profile's answer.
     Null when the profile has never been asked — the three rows then start with
     nothing selected, which is the state the screenshot was taken in and the
     reason the rows looked broken: they were never controls. */
  const [packMode, setPackMode] = useState<WorkMode | null>(data.trainer.workMode);
  /* The one pack they are buying, or none. A single id and not a set, because
     the answer is "which pack" — two live packs on one client is the state
     `PackPanel` exists to prevent, and the server closes the older one on the
     second sale rather than holding both. */
  const [packId, setPackId] = useState<string | null>(null);
  const [trainerSplit, setTrainerSplit] = useState<number>(
    data.trainer.gymSharePercent !== null ? 100 - data.trainer.gymSharePercent : 60,
  );
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  /* Minted when the flow opens (api-contract Clients A5, A7, Programs A5): a
     retried Continue, Sell or Apply replays the same id and the server answers
     with the row the first attempt made, so nothing is made twice. */
  const [ids] = useState(() => ({ client: crypto.randomUUID(), pack: crypto.randomUUID(), plan: crypto.randomUUID() }));
  /** `schedule.version` from the create, then from each save — step 3's If-Match. */
  const [scheduleVersion, setScheduleVersion] = useState<string | null>(null);
  /**
   * What the server currently holds for the five things steps 1 and 2 write.
   *
   * Three jobs, and each one is a bug that existed without it. It answers
   * "has anything changed since I saved" so a Back-then-Continue costs no
   * request; it is how the phone check knows the client's OWN number, which
   * otherwise comes back `CLIENT_PHONE_EXISTS` and warns a trainer that the
   * person they just added is already on their roster; and `packId` is how the
   * picker knows a pack has been SOLD, which is the one thing on these two
   * steps that a second press cannot simply overwrite.
   */
  const [committed, setCommitted] = useState<{
    name: string;
    phone: string;
    deliveryMode: 'floor' | 'remote';
    clientType: 'independent' | 'gym';
    packId: string | null;
  } | null>(null);
  /** The furthest rung reached. Rungs and Back walk anywhere at or below it. */
  const [maxStep, setMaxStep] = useState<Step>(1);
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<Record<number, string>>({});
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Which way the stage should enter from. A step reached by *going back* — the
     done rungs allow it — slides in from the left, so the body agrees with the
     direction the trace and the climber just travelled. State and not a ref:
     it is read during render, which is exactly what a ref may not be. */
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');

  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  /* focus name on open */
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  /* Coming back from *Business › Packages*. The draft is applied DURING a
     render — React's documented way of adjusting state when an input changes,
     and the same call `Schedule.tsx` makes for `?new=1` — so the half-filled
     form never paints empty for a frame on its way to being restored. It lands
     on step 2, which is the step the trainer left from and now has a price list
     on it. */
  const draftRaw = useSyncExternalStore(subscribeDraft, draftSnapshot, serverDraftSnapshot);
  const [appliedDraft, setAppliedDraft] = useState<string | null>(null);

  if (draftRaw && draftRaw !== appliedDraft) {
    setAppliedDraft(draftRaw);
    const draft = parseDraft(draftRaw);
    if (draft) {
      setName(draft.name);
      setPhone(draft.phone);
      setDeliveryMode(draft.deliveryMode);
      setTrainerSplit(draft.trainerSplit);
      setPackMode(draft.packMode);
      /* Validated against the list as it stands NOW, and against the mode's own
         two lists: the trainer left to change this price list, so the pack they
         had picked may have been retired while they were gone. */
      const lists = draft.packMode ? LISTS_FOR[draft.packMode] : { own: false, gym: false };
      const still = data.packs.some(
        pk => pk.id === draft.packId && (pk.owner === 'gym' ? lists.gym : lists.own),
      );
      setPackId(still ? draft.packId : null);
      setStep(2);
    }
  }

  /* And the draft is CONSUMED, so a trainer who finishes this client and adds a
     second one in the same tab does not inherit the first one's name. The
     snapshot is already cached, so clearing the key cannot change what this
     render read. */
  useEffect(() => clearDraft(), []);

  /* Escape, and ONLY in the drawer. Escape dismisses a dialog; on a route it
     would navigate away from a half-filled form on a keypress nobody aimed at
     a dismissible thing. */
  useEffect(() => {
    if (shell !== 'drawer') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shell, cancel]);

  /* phone validation — debounced; state is reset in onChange, not in the effect */
  const doPhoneCheck = useCallback(async (rawPhone: string) => {
    const digits = cleanPhone(rawPhone);
    if (digits.length < 10) return;
    /* Their own number, on a Back to step 1. Asking would answer
       `CLIENT_PHONE_EXISTS` — truthfully, about the row this flow just wrote —
       and the screen would warn the trainer that the person they are editing is
       already on their roster. A request that can only produce a lie is a
       request not worth making. */
    if (committed && digits === committed.phone) {
      setPhoneCheck('ok');
      setRosterMatch(null);
      return;
    }
    setPhoneCheck('checking');
    setRosterMatch(null);
    try {
      const result = await checkPhone(digits);
      if (!result.available) {
        if (result.code === 'PHONE_ALREADY_YOURS') {
          setPhoneCheck('on-roster');
          setRosterMatch(result.clientId ? { id: result.clientId, name: result.clientName ?? 'them' } : null);
        } else {
          setPhoneCheck('blocked');
        }
      } else {
        setPhoneCheck('ok');
        setRosterMatch(null);
      }
    } catch {
      setPhoneCheck('idle');
    }
  }, [committed]);

  /* trigger the debounced check whenever phone changes */
  useEffect(() => {
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    if (cleanPhone(phone).length >= 10) {
      phoneCheckTimer.current = setTimeout(() => { void doPhoneCheck(phone); }, 500);
    }
    return () => {
      if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    };
  }, [phone, doPhoneCheck]);

  /* derived */
  /* The SELECTED mode and no longer the profile's, which is the whole of what
     picking *Gym* on a profile that says *Independent* has to mean: the counter
     collects for this one, so there is a share to ask for. A trainer who
     changes nothing gets the old answer, because the selection is seeded with
     the profile. */
  const showSplit =
    (packMode === 'gym' || packMode === 'both') && deliveryMode === 'floor';
  const gymShare = 100 - trainerSplit;

  /* The two price lists, split by whose they are. Already ordered and already
     filtered to active by `getNewClientData`. */
  const ownPacks = useMemo(() => data.packs.filter(p => p.owner === 'trainer'), [data.packs]);
  const gymPacks = useMemo(() => data.packs.filter(p => p.owner === 'gym'), [data.packs]);

  const lists = packMode ? LISTS_FOR[packMode] : { own: false, gym: false };
  const gymLabel = data.trainer.gymName ?? 'The gym';
  const shownPackCount =
    (lists.own ? ownPacks.length : 0) + (lists.gym ? gymPacks.length : 0);

  /* The pick, resolved against what is ON SCREEN rather than against the whole
     price list. Everything downstream reads THIS and never `packId`, so a
     selection that has stopped being visible — the mode changed, the pack was
     retired during the detour — can never be the thing that gets sold. */
  const picked = useMemo(() => {
    if (!packId) return null;
    const pack = data.packs.find(pk => pk.id === packId);
    if (!pack) return null;
    return (pack.owner === 'gym' ? lists.gym : lists.own) ? pack : null;
  }, [packId, data.packs, lists.gym, lists.own]);

  /* ONE pack, across BOTH lists. The two groups are two price lists and not two
     questions — on `both` a client buys from the gym's counter or from yours,
     never from each in one sale — so the state is a single id and picking in
     one group replaces a pick in the other by construction. */
  const pickPack = useCallback((id: string | null) => setPackId(id), []);

  /* client_type (R18): a gym client buys the gym's packs, so the pick decides;
     with no pick, the mode does. */
  const clientType: 'independent' | 'gym' =
    picked ? (picked.owner === 'gym' ? 'gym' : 'independent') : packMode === 'gym' ? 'gym' : 'independent';

  /* Changing whose packs they buy drops a pick the new mode cannot show, in the
     handler rather than in an effect: an effect would paint one frame with a
     gym pack selected under a list that no longer contains it. */
  const choosePackMode = useCallback((mode: WorkMode) => {
    setPackMode(mode);
    setPackId(prev => {
      if (!prev) return null;
      const pack = data.packs.find(pk => pk.id === prev);
      if (!pack) return null;
      return (pack.owner === 'gym' ? LISTS_FOR[mode].gym : LISTS_FOR[mode].own) ? prev : null;
    });
  }, [data.packs]);

  /**
   * Park the form and go define a price list.
   *
   * Not automatic on the click that picks a mode, and that is a deliberate
   * reading of "redirect them": the pick is how a trainer LOOKS at a list, and
   * a look that throws the screen away is a control nobody presses twice. The
   * empty state says what is missing and its button is the redirect, one press
   * away and named.
   */
  const goDefinePacks = useCallback(() => {
    writeDraft({ name, phone, deliveryMode, trainerSplit, packMode, packId });
    /* The drawer has to close before the route under it changes, or the dialog
       is left open over the screen it navigated to. */
    onClose?.();
    router.push(`/business/packages?from=${PACKS_DETOUR}`);
  }, [name, phone, deliveryMode, trainerSplit, packMode, packId, onClose, router]);

  const eligibleTemplates =
    weekdays.size > 0
      ? data.templates.filter(t => (t.dayLabels?.length ?? 0) === weekdays.size)
      : data.templates;

  /* ── what the band says ────────────────────────────────────────────────
     The head's whole argument is that a trainer filling four steps wants to
     watch the person appear. So the title IS the name once there is one, and
     the line under it is whatever the number is currently doing. */
  const trimmed = name.trim();
  const digits = cleanPhone(phone);
  const seatId = createdClientId ?? trimmed;

  /* Belt to `doPhoneCheck`'s braces: the request is skipped there, and any state
     left over from before the edit is overruled here at render time, so the band
     and the warning agree with each other on the very first frame. */
  const phoneIsOwn = committed !== null && digits === committed.phone;

  const status = useMemo((): { text: React.ReactNode; tone?: 'ok' | 'warn' | 'bad'; key: string } => {
    if (createdClientId) return { key: 'made', tone: 'ok', text: 'On your roster · finishing the setup', };
    /* Short, and deliberately NOT the field's own hint. It used to read *Start
       with the name they already go by*, which needs 263px of a 254px line at
       390 — so it ellipsised on the one state a trainer sees before they have
       typed anything — and the field 100px below it already says *Use the name
       they are already known by*. The nuance belongs to the field; the band
       says which end to start. */
    if (!trimmed) return { key: 'noname', text: 'Start with their name' };
    if (digits.length < 10) return { key: 'nonum', text: `Needs a 10-digit number · ${digits.length}/10` };
    if (phoneCheck === 'checking') return { key: 'chk', text: `Checking +91 ${displayPhone(phone)}…` };
    if (phoneCheck === 'ok') return { key: 'ok', tone: 'ok', text: `+91 ${displayPhone(phone)} · free to add` };
    if (phoneCheck === 'on-roster') return { key: 'dupe', tone: 'warn', text: `+91 ${displayPhone(phone)} · already on your roster` };
    if (phoneCheck === 'blocked') return { key: 'no', tone: 'bad', text: `+91 ${displayPhone(phone)} · cannot be added` };
    return { key: 'have', text: `+91 ${displayPhone(phone)}` };
    /* No `phoneIsOwn` branch, and that is not an omission: `committed` is only
       ever set alongside `createdClientId`, so the first line above has already
       returned by the time it could be true. A branch that cannot be reached is
       a branch that misleads the next reader about what this memo answers. */
  }, [createdClientId, trimmed, digits, phone, phoneCheck]);

  /* Progress is the fraction of the ridge that is behind you: rung 1 is the
     start line, not one quarter done. */
  const progress = (step - 1) / (STEP_DEFS.length - 1);
  const climber = climberAt(progress);

  /* ── STEP NAVIGATION — BOTH WAYS, AND THAT IS THE CHANGE ─────────────────
   *
   * This used to be `goBack`, and it refused two things. It refused any forward
   * move, so a trainer who went back to fix a name had to press Continue
   * through every step to return — and it refused *Who* and *Money* outright
   * once the client existed, on the reasoning that "the server has them". True,
   * and the wrong conclusion: the server has them and `PUT /v1/clients/{id}`
   * takes them back, so the answer is an edit rather than a wall. The rungs for
   * those two were drawn as plain text with no handler, which is the dead
   * control this codebase keeps deleting.
   *
   * The one rule left is `maxStep`: a step is reachable once it has been
   * reached. Skipping ahead to *Plan* from step 1 would put a trainer on a
   * screen that assigns a program to a client who does not exist yet.
   */
  const goStep = (target: Step) => {
    if (target === step || target > maxStep) return;
    setError(null);
    setDir(target < step ? 'back' : 'fwd');
    setStep(target);
  };

  const goTo = (target: Step) => {
    setDir('fwd');
    setStep(target);
    setMaxStep(prev => (target > prev ? target : prev));
  };

  /* step 1 — and on a return visit it SAVES rather than merely advancing. */
  const handleStep1Continue = async () => {
    if (!name.trim()) { setError('Enter their name.'); return; }
    if (digits.length < 10) { setError('Enter a 10-digit phone number.'); return; }
    if (!phoneIsOwn) {
      if (phoneCheck === 'checking') { setError('Still checking this number — wait a moment.'); return; }
      if (phoneCheck === 'blocked') { setError('That number cannot be added.'); return; }
    }
    setError(null);

    /* Nothing committed yet: the row is created at the end of step 2, so step 1
       is still only a form and Continue is still only a navigation. */
    if (!createdClientId || !committed) { goTo(2); return; }

    /* A no-op save is a no-op — `/settings/profile/work` states the rule and it
       matters more here, because Back-then-Continue is how a trainer CHECKS
       what they typed, and checking should not cost a write. */
    if (trimmed === committed.name && digits === committed.phone) { goTo(2); return; }

    if (submitting) return;
    setSubmitting(true);
    try {
      await updateClientDetails(createdClientId, { name: trimmed, phone: digits });
      setCommitted({ ...committed, name: trimmed, phone: digits });
      goTo(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Nothing changed.');
    } finally {
      setSubmitting(false);
    }
  };

  /* step 2 — and it is TWO writes now, in an order that matters.
   *
   * The client is created first and the pack is sold against the id that comes
   * back, because `POST /v1/clients/{id}/packages` needs somebody to sell to.
   * Which makes the second write the one that can fail on its own, and there is
   * exactly one honest thing to do when it does: the client EXISTS, going back
   * to step 2 is already refused once `createdClientId` is set, and dropping
   * the trainer back on a form for somebody who is on their roster would invite
   * them to add the person twice. So the flow continues and the banner says
   * what did not happen, in the server's own words — `assignPackage` prefers
   * `PackageRuleException`'s sentence over one of ours for that reason.
   *
   * `includePack` is the Skip button's whole meaning. Its label has always read
   * *sell it on the day they pay*, which was a promise about a control that did
   * not exist yet; it is literally what this argument does now.
   */
  const handleCreateClient = async (includeSplit: boolean, includePack: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createClient({
        id: ids.client,
        name: name.trim(),
        phone: digits,
        clientType,
        deliveryMode,
      });
      setCreatedClientId(created.id);
      setScheduleVersion(created.scheduleVersion);
      setCommitted({ name: trimmed, phone: digits, deliveryMode, clientType, packId: null });

      if (includePack && picked) {
        /* `packId` alone is a complete sale: the pack's own terms are copied on
           the server. The split rides on a gym pack's sale (R3). */
        const sale = await sellPack(created.id, {
          id: ids.pack,
          packId: picked.id,
          trainerSharePercent: includeSplit && showSplit && picked.owner === 'gym' ? trainerSplit : undefined,
        });
        if (sale.ok) {
          setCommitted(prev => (prev ? { ...prev, packId: picked.id } : prev));
        } else {
          setError(
            `${sale.message ?? 'That pack did not go through.'} ` +
              `${trimmed} is on your roster — sell them a pack from their file.`,
          );
        }
      }
      goTo(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Step 2, SECOND time round — the row exists, so nothing here may create one.
   *
   * Three fields and three different kinds of thing. Delivery and the split are
   * columns on the client and go back through the same partial PUT step 1 uses.
   * The pack is not: selling a second one CLOSES the first server-side (the
   * mock does it, and `PackPanel` exists because two live packs on one person
   * is the state this product refuses), which would leave a dead package and a
   * pending invoice behind a trainer who only meant to change their mind. So a
   * sale is offered exactly once from this screen and the picker states that
   * afterwards rather than re-arming.
   */
  const handleStep2Save = async () => {
    if (!createdClientId || !committed || submitting) return;
    setError(null);

    /* Delivery is the schedule's, so it rides on step 3's save; the split is
       the sale's. Only the client type is a field on the client. */
    const detailsDirty = clientType !== committed.clientType;
    const sellNow = committed.packId === null && picked !== null;
    if (!detailsDirty && !sellNow) { goTo(3); return; }

    setSubmitting(true);
    try {
      if (detailsDirty) {
        await updateClientDetails(createdClientId, { clientType });
        setCommitted(prev => (prev ? { ...prev, clientType } : prev));
      }
      if (sellNow && picked) {
        const sale = await sellPack(createdClientId, {
          id: ids.pack,
          packId: picked.id,
          trainerSharePercent: showSplit && picked.owner === 'gym' ? trainerSplit : undefined,
        });
        if (sale.ok) setCommitted(prev => (prev ? { ...prev, packId: picked.id } : prev));
        else setError(sale.message ?? 'That pack did not go through. Nothing else changed.');
      }
      goTo(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Nothing changed.');
    } finally {
      setSubmitting(false);
    }
  };

  /* step 3 */
  const handleStep3Continue = async () => {
    if (!createdClientId || !scheduleVersion || submitting) return;
    /* Program days in week order (R45): the first slot books Day 1. */
    const slots = Object.entries(selectedSlots)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([wd, time], idx) => ({ weekday: Number(wd), start: time, programDay: idx + 1 })) satisfies WeeklySlot[];

    const modeChanged = committed !== null && deliveryMode !== committed.deliveryMode;
    if (slots.length === 0 && !modeChanged) { goTo(4); return; }
    setSubmitting(true);
    setError(null);
    try {
      const saved = await saveSchedule(createdClientId, scheduleVersion, { deliveryMode, slots });
      setScheduleVersion(saved.version);
      setCommitted(prev => (prev ? { ...prev, deliveryMode } : prev));
      goTo(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  /* step 4 */
  const handleApplyTemplate = async () => {
    if (!createdClientId || !selectedTemplateId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await applyTemplate(selectedTemplateId, { id: ids.plan, clientId: createdClientId });
      onClose?.();
      router.push(`/clients/${createdClientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  };

  /* Finishing lands on the client just created — on BOTH surfaces. The route
     used to push `/clients`, which dropped the trainer back on the roster to
     hunt for the row they had just made. */
  const goToClient = () => {
    onClose?.();
    if (createdClientId) router.push(`/clients/${createdClientId}`);
  };

  /* ── render ──
     `.acflow` is the class BOTH shells carry and the one the phone rules and
     the coarse-pointer targets hang off; `.adrawer` adds only the dialog's own
     box. The band / body / foot classes keep their `adrawer__*` names because
     that is where they were written and measured — renaming fifteen verified
     rules to buy a prefix is churn on a surface that is already right. */
  const Title = shell === 'page' ? 'h1' : 'span';

  const flow = (
    <>
        {/* ═══ THE ASCENT — identity, ridge and rungs on one dark plate ═══ */}
        <header className="ascent">

          {/* line one · the client assembling */}
          <div className="ascent__who">
            <span
              className="ascent__seat"
              data-filled={trimmed ? '1' : '0'}
              aria-hidden="true"
              style={trimmed ? { background: avatarToken(seatId) } : undefined}
            >
              {trimmed && <span className="ascent__ini" key={initials(trimmed)}>{initials(trimmed)}</span>}
            </span>

            <span className="ascent__id">
              {/* An `<h1>` on the route and a `<span>` in the dialog. A page
                  owes the document a heading — this shell's own pass records a
                  screen whose heading list "came back empty" — and a dialog
                  does not, because `aria-label` on `role="dialog"` names it.
                  The band IS the header on both, so there is no second copy. */}
              <Title className="ascent__name">{trimmed || 'Add a client'}</Title>
              <span className="ascent__sub" data-tone={status.tone}>
                <span key={status.key}>{status.text}</span>
              </span>
            </span>

            <span className="ascent__count" aria-hidden="true">
              <b>{String(step).padStart(2, '0')}</b>/{String(STEP_DEFS.length).padStart(2, '0')}
            </span>

            {/* One control, two meanings, and the name says which: the dialog
                dismisses, the route goes back to the roster. */}
            <button
              className="ascent__x"
              type="button"
              aria-label={shell === 'drawer' ? 'Close' : 'Cancel and go back to the roster'}
              onClick={cancel}
            >
              <XIcon />
            </button>
          </div>

          {/* line two · the ridge */}
          <svg
            className="ascent__ridge"
            viewBox="0 0 472 46"
            role="img"
            aria-label={`Step ${step} of ${STEP_DEFS.length}: ${STEP_DEFS[step - 1].label}`}
            style={{ ['--p' as string]: progress }}
          >
            <line className="ridge__base" x1="0" y1={BASE_Y} x2="472" y2={BASE_Y} />
            {RUNG_X.map((x, i) => (
              <line key={`d${x}`} className="ridge__drop" x1={x} y1={RUNG_Y[i] + 7} x2={x} y2={BASE_Y} />
            ))}

            <polyline className="ridge__track" points={RIDGE_PATH} />
            <polyline className="ridge__trace" points={RIDGE_PATH} pathLength={100} />

            {RUNG_X.map((x, i) => {
              const done = i + 1 < step;
              return (
                <g key={`n${x}`}>
                  <circle className="ridge__node" data-on={done ? '1' : '0'} cx={x} cy={RUNG_Y[i]} r={done ? 6.5 : 4.5} />
                  <path
                    className="ridge__tick"
                    d={`M${x - 3.1} ${RUNG_Y[i]} l2.2 2.3 l4.1 -4.6`}
                  />
                </g>
              );
            })}

            {/* the climber — glides between rungs, so the head animates the
                progression rather than redrawing it */}
            <g
              className="ridge__climber"
              style={{ transform: `translate(${climber.x}px, ${climber.y}px)` }}
            >
              <circle className="ridge__halo" r="10" />
              <circle className="ridge__disc" r="5" />
            </g>
          </svg>

          {/* line three · the rungs */}
          <div className="ascent__rungs" role="list" aria-label="Onboarding steps">
            {STEP_DEFS.map(s => {
              const done = s.n < step;
              const active = s.n === step;
              /* Any step already REACHED, in either direction — see `goStep`.
                 It used to be `done && !(createdClientId && s.n <= 2)`, which
                 drew *Who* and *Money* as inert text for the whole second half
                 of the flow. */
              const canClick = !active && s.n <= maxStep;
              const cls = `rung${done ? ' rung--done' : ''}${active ? ' rung--active' : ''}`;
              const inner = (
                <>
                  {s.label}
                  {s.optional && <span className="rung__opt">opt</span>}
                </>
              );

              return canClick ? (
                <button
                  key={s.n}
                  className={cls}
                  type="button"
                  role="listitem"
                  onClick={() => goStep(s.n)}
                  aria-label={`Go to ${s.label}`}
                >
                  {inner}
                </button>
              ) : (
                <span key={s.n} className={cls} role="listitem" aria-current={active ? 'step' : undefined}>
                  {inner}
                </span>
              );
            })}
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div style={{ padding: '12px 20px 0' }}>
            <div className="why why--warn" style={{ padding: '8px 12px' }}>
              <p style={{ margin: 0 }}>{error}</p>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="adrawer__body">
          <div className="adstage" key={step} data-dir={dir}>

            {/* STEP 1 — WHO */}
            {step === 1 && (
              <>
                <div style={{ ['--i' as string]: 0 }}>
                  <Sec k="Their name" />
                  <div className="fld">
                    <input
                      id="nc-name"
                      ref={nameRef}
                      className="ctl"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Arjun Subramanian"
                      autoComplete="off"
                      aria-label="Their name"
                      onKeyDown={e => { if (e.key === 'Enter') handleStep1Continue(); }}
                    />
                    <p className="fld__h">Use the name they are already known by.</p>
                  </div>
                </div>

                <div style={{ ['--i' as string]: 1 }}>
                  <Sec k="Phone number" />
                  <div className="fld">
                    <div className="affix">
                      <span
                        className="ctl ctl--said"
                        style={{
                          width: 52,
                          borderRadius: 'var(--tx-r2) 0 0 var(--tx-r2)',
                          borderRight: 0,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        +91
                      </span>
                      <input
                        id="nc-phone"
                        className="ctl"
                        value={displayPhone(phone)}
                        onChange={e => {
                          const v = e.target.value;
                          setPhone(v);
                          if (cleanPhone(v).length < 10) {
                            setPhoneCheck('idle');
                            setRosterMatch(null);
                          }
                        }}
                        placeholder="98410 22119"
                        inputMode="numeric"
                        autoComplete="tel"
                        aria-label="Phone number"
                        onKeyDown={e => { if (e.key === 'Enter') void handleStep1Continue(); }}
                      />
                    </div>
                    <p className="fld__h">Reminders and the invite both go to this number.</p>
                  </div>
                </div>

                {/* phone warnings */}
                {phoneCheck === 'on-roster' && !dismissedRosterWarn && !phoneIsOwn && (
                  <div className="why why--warn" style={{ padding: '12px 14px', ['--i' as string]: 2 }}>
                    <p className="why__k" style={{ marginBottom: 4 }}>Already on your roster</p>
                    <p>
                      {rosterMatch
                        ? <><b>{rosterMatch.name}</b> has this number. </>
                        : <>Someone on your roster has this number. </>}
                      Two records for one person split their pack and their
                      history in half — and two people do share a phone, so this
                      is a caution, not a refusal.
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {rosterMatch && (
                        <Button
                          href={`/clients/${rosterMatch.id}`}
                          variant="secondary"
                          size="sm"
                          onClick={onClose}
                        >
                          Open {rosterMatch.name.split(' ')[0]}&apos;s file
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDismissedRosterWarn(true)}
                      >
                        It&apos;s a different person
                      </Button>
                    </div>
                  </div>
                )}

                {phoneCheck === 'blocked' && !phoneIsOwn && (
                  <div className="why why--warn" style={{ padding: '12px 14px', ['--i' as string]: 2 }}>
                    <p className="why__k" style={{ marginBottom: 4 }}>This number cannot be added</p>
                    <p>
                      The number belongs to a trainer account or another trainer&apos;s
                      client — it cannot be on two rosters at once.
                    </p>
                  </div>
                )}

                <div style={{ ['--i' as string]: 3 }}>
                  <Sec k="Any time later" n="not now" />
                  <Card>
                    <KeyValueRow
                      k={<>Plan
                        <span className="small" style={{ marginLeft: 8 }}>After their first session</span></>}
                      valueClassName="ink3"
                    >—</KeyValueRow>
                    <KeyValueRow
                      k={<>Pack
                        <span className="small" style={{ marginLeft: 8 }}>Sell it on the day they pay</span></>}
                      valueClassName="ink3"
                    >—</KeyValueRow>
                  </Card>
                </div>
              </>
            )}

            {/* STEP 2 — MONEY */}
            {step === 2 && (
              <>
                {/* ── WHOSE PACKS ──────────────────────────────────────────
                    These three used to be `<div>`s with an `aria-selected` and
                    no handler — a radio list that drew the profile's answer and
                    could not be answered. On a profile that had never been
                    asked, `workMode` is null, so all three sat unfilled and the
                    section read as three broken buttons. They are buttons now,
                    and pressing one is what puts a price list on the screen. */}
                <div style={{ ['--i' as string]: 0 }}>
                  <Sec
                    k="Whose packs they buy"
                    n={packMode ? WORK_MODE_INFO[packMode].label : 'pick one'}
                  />
                  <div className="lgl" role="group" aria-label="Whose packs this client buys">
                    {ALL_MODES.map(mode => {
                      const info = WORK_MODE_INFO[mode];
                      const active = packMode === mode;
                      return (
                        <button
                          key={mode}
                          className="lrow"
                          type="button"
                          /* `aria-pressed` and not `role="radio"`, which the
                             first version of this used and which cost the row
                             its GROUND: §04 paints `.lgl .lrow[aria-pressed]`
                             and has no rule for `aria-checked`, so the picked
                             row lost the fill the `<div aria-selected>` it
                             replaced used to get. It is also the answer
                             `/packages` settled on for this same question —
                             see `Chip`'s note on why a toggle button is not a
                             radio. */
                          aria-pressed={active}
                          onClick={() => choosePackMode(mode)}
                        >
                          <span className={`rad${active ? ' rad--on' : ''}`} />
                          <span className="lrow__m">
                            <span className="lrow__t">{info.label}</span>
                            <span className="lrow__s">{info.sub}</span>
                          </span>
                          <span className={info.tagClass}>{info.tag}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="small" style={{ marginTop: 6 }}>
                    {data.trainer.workMode
                      ? <>Your profile says <b>{WORK_MODE_INFO[data.trainer.workMode].label}</b> — change it here for this client alone.</>
                      : <>Your profile has never been asked. Whatever you pick here applies to this client alone.</>}
                  </p>
                </div>

                {/* ── THE PRICE LIST THAT PICK JUST NAMED ─────────────────────
                    One list for *Independent* or *Gym*, both for *Both*. A list
                    with nothing on it is the case that leaves this screen — see
                    `goDefinePacks`. */}
                <div style={{ ['--i' as string]: 1 }}>
                  <Sec
                    k="What you can sell them"
                    n={
                      picked
                        ? '1 picked'
                        : packMode
                          ? `${shownPackCount} pack${shownPackCount === 1 ? '' : 's'}`
                          : undefined
                    }
                  />

                  {/* SOLD. The picker does not come back, and the sentence
                      says why rather than leaving a disabled list to be pressed
                      at — a second sale would close this one and leave a dead
                      package with a pending invoice against it. */}
                  {committed?.packId && (
                    <Card>
                      <KeyValueRow
                        k={
                          <>
                            {data.packs.find(pk => pk.id === committed.packId)?.name ?? 'A pack'}
                            <span className="small" style={{ marginLeft: 8 }}>sold with this client</span>
                          </>
                        }
                        valueClassName="mono"
                      >
                        {rupees(data.packs.find(pk => pk.id === committed.packId)?.amount ?? 0)}
                      </KeyValueRow>
                    </Card>
                  )}
                  {committed?.packId && (
                    <p className="small" style={{ marginTop: 8 }}>
                      Already on their file. Change it from their own page — swapping it
                      here would close this one and leave the invoice behind.
                    </p>
                  )}

                  {!committed?.packId && !packMode && (
                    <Card bare>
                      <EmptyState
                        inCard
                        icon={<PackIcon size={22} />}
                        title="Pick one above"
                        body="Independent shows your own price list, Gym shows the counter's, Both shows the two of them."
                      />
                    </Card>
                  )}

                  {!committed?.packId && lists.own && (
                    <>
                      {/* The sub-heading is drawn only on *Both*, where two
                          lists are stacked and an unlabelled one is a price a
                          trainer cannot attribute. On the single-list modes the
                          section above already said whose it is. */}
                      {lists.gym && <p className="small" style={{ margin: '10px 0 6px' }}>Your own</p>}
                      {ownPacks.length > 0 ? (
                        <PriceList
                          packs={ownPacks}
                          label="Your own packs"
                          pickedId={packId}
                          onPick={pickPack}
                        />
                      ) : (
                        <Card bare>
                          <EmptyState
                            inCard
                            icon={<PackIcon size={22} />}
                            title="Your price list is empty"
                            body="Nothing to sell them yet. Define what you charge — a session pack, a monthly fee, a single — and come back; this client is kept exactly as you left it."
                            action={
                              <Button variant="primary" size="sm" onClick={goDefinePacks}>
                                Set up your packs <ArrowIcon />
                              </Button>
                            }
                          />
                        </Card>
                      )}
                    </>
                  )}

                  {!committed?.packId && lists.gym && (
                    <>
                      {lists.own && <p className="small" style={{ margin: '14px 0 6px' }}>{gymLabel}</p>}
                      {gymPacks.length > 0 ? (
                        <PriceList
                          packs={gymPacks}
                          label={`${gymLabel}'s packs`}
                          pickedId={packId}
                          onPick={pickPack}
                        />
                      ) : (
                        <Card bare>
                          <EmptyState
                            inCard
                            icon={<PackIcon size={22} />}
                            title={`Nothing from ${gymLabel} yet`}
                            body="The counter's prices are not on file. Add what they charge and you can pick it on the day this client pays; nothing you have typed here is lost."
                            action={
                              <Button variant="primary" size="sm" onClick={goDefinePacks}>
                                Set up the gym&apos;s packs <ArrowIcon />
                              </Button>
                            }
                          />
                        </Card>
                      )}
                    </>
                  )}

                  {/* ── WHAT THE PICK COMMITS TO, AND THE WAY OUT OF IT ───────
                      A pressed row can be pressed again to clear it and nobody
                      guesses that, and this step still carries a Skip — so
                      *Clear* is drawn rather than left to be discovered. The
                      sentence beside it is the consequence in the future tense:
                      the sale does not happen here, it happens on Continue, and
                      this is the last moment it is still free to change. */}
                  {!committed?.packId && picked && (
                    <div
                      className="small"
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ flex: '1 1 220px' }}>
                        Continue starts them on <b>{picked.name}</b> · {rupees(picked.amount)}.
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => pickPack(null)}>
                        Clear
                      </Button>
                    </div>
                  )}
                  {!committed?.packId && !picked && shownPackCount > 0 && (
                    <p className="small" style={{ marginTop: 8 }}>
                      Pick one, or leave it — a pack can be sold on the day they pay.
                    </p>
                  )}
                </div>

                <div style={{ ['--i' as string]: 2 }}>
                  <Sec k="Where they train" />
                  <div className="wk">
                    {(['floor', 'remote'] as const).map(mode => (
                      <Chip
                        pressed={deliveryMode === mode}
                        key={mode}
                        onClick={() => setDeliveryMode(mode)}
                        style={
                          deliveryMode === mode
                            ? { background: 'var(--tx-accent-soft)', borderColor: 'var(--tx-accent-line)', color: 'var(--tx-accent-text)' }
                            : undefined
                        }
                      >
                        {mode === 'floor' ? 'In Person' : 'Online'}
                      </Chip>
                    ))}
                    <span className="small" style={{ marginLeft: 6 }}>decides whether there is a share to ask for</span>
                  </div>
                </div>

                {showSplit && (
                  <div style={{ ['--i' as string]: 3 }}>
                    <Sec k="The split" n={`${trainerSplit} / ${gymShare}`} />
                    <Card>
                      <KeyValueRow k={<>What <b>you</b> keep</>}>
                        <input
                          className="ctl ctl--num"
                          style={{ width: 64, height: 30 }}
                          value={trainerSplit}
                          min={0}
                          max={100}
                          type="number"
                          aria-label="Percent you keep"
                          onChange={e => setTrainerSplit(Math.max(0, Math.min(100, Number(e.target.value))))}
                        />
                        {' %'}
                      </KeyValueRow>
                      <KeyValueRow k="The gym&apos;s share, therefore" valueClassName="ink3">{gymShare}%</KeyValueRow>
                    </Card>
                  </div>
                )}

                {/* `/clients/new` carried two `.why` cards here and both were
                    addressed to a reviewer rather than to a trainer — one
                    explained `trainerSplitPercent` in a `<code>` tag, which the
                    card's own *What you keep* / *The gym's share, therefore*
                    pair already says, and the other explained `POST /v1/clients`.
                    The FIRST is a duplicate and is gone. The SECOND is a real
                    promise about what the next press does, so it is kept — in
                    the trainer's words, and next to the button that does it. */}
                <div className="why" style={{ padding: '10px 14px', ['--i' as string]: 4 }}>
                  <p className="why__k" style={{ marginBottom: 2 }}>
                    {createdClientId ? 'Continue saves what you changed' : 'Continue creates the client'}
                  </p>
                  <p style={{ margin: 0 }}>
                    {createdClientId ? (
                      <>
                        {trimmed || 'They'} is already on your roster — nothing here can
                        add them twice. The week and the plan are still the two steps you
                        can leave for later.
                      </>
                    ) : (
                      <>
                        Stop after this and they are still on your roster — the week
                        and the plan are the two steps you can leave for later.{' '}
                        {picked
                          ? <>It also puts <b>{picked.name}</b> on their file.</>
                          : 'The pack itself is sold on the day they pay.'}
                      </>
                    )}
                  </p>
                </div>
              </>
            )}

            {/* STEP 3 — WEEK */}
            {step === 3 && (
              <>
                <div style={{ ['--i' as string]: 0 }}>
                  <Sec k="Which days" n={weekdays.size ? `${weekdays.size} picked` : 'none yet'} />
                  <div className="wk">
                    {WEEKDAYS.map(wd => {
                      const active = weekdays.has(wd.n);
                      return (
                        <Chip
                          pressed={active}
                          key={wd.n}
                          onClick={() => {
                            const next = new Set(weekdays);
                            if (active) {
                              next.delete(wd.n);
                              const slots = { ...selectedSlots };
                              delete slots[wd.n];
                              setSelectedSlots(slots);
                            } else {
                              next.add(wd.n);
                            }
                            setWeekdays(next);
                          }}
                          style={
                            active
                              ? { background: 'var(--tx-accent-soft)', borderColor: 'var(--tx-accent-line)', color: 'var(--tx-accent-text)' }
                              : undefined
                          }
                        >
                          {wd.label}
                        </Chip>
                      );
                    })}
                  </div>
                </div>

                {Array.from(weekdays)
                  .sort((a, b) => a - b)
                  .map((wd, i) => {
                    const wdLabel = WEEKDAYS.find(w => w.n === wd)?.label ?? '';
                    const slots = slotsForDay(wd, data.workingHours);
                    const pickedTime = selectedSlots[wd];

                    if (slots.length === 0) {
                      return (
                        <div key={wd} style={{ ['--i' as string]: i + 1 }}>
                          <Sec k={wdLabel} n="no working hours set for this day" />
                        </div>
                      );
                    }

                    return (
                      <div key={wd} style={{ ['--i' as string]: i + 1 }}>
                        <Sec k={`${wdLabel} · your hours, minus the hours others hold`} n={pickedTime ?? '—'} />
                        <div className="slots">
                          {slots.map(slot => {
                            const holder = heldBy(wd, slot.time, data.clients);
                            const isPicked = pickedTime === slot.time;
                            if (holder) {
                              return (
                                <span key={slot.time} className="slot slot--held" aria-disabled="true">
                                  {slot.time}
                                  <small>{holder.split(' ')[0]} has it</small>
                                </span>
                              );
                            }
                            return (
                              <button
                                key={slot.time}
                                className={`slot${isPicked ? ' slot--on' : ''}`}
                                type="button"
                                onClick={() =>
                                  setSelectedSlots(prev => {
                                    if (isPicked) {
                                      const copy = { ...prev };
                                      delete copy[wd];
                                      return copy;
                                    }
                                    return { ...prev, [wd]: slot.time };
                                  })
                                }
                              >
                                {slot.time}
                                <small>{isPicked ? 'picked' : 'free'}</small>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </>
            )}

            {/* STEP 4 — PLAN */}
            {step === 4 && (
              <>
                {eligibleTemplates.length === 0 ? (
                  <EmptyState
                    icon={<><PackIcon size={22} /></>}
                    title="No programs yet"
                    body={weekdays.size > 0
                      ? `No plans with ${weekdays.size} day${weekdays.size > 1 ? 's' : ''} match. You can assign one later from their file.`
                      : 'Build a template and apply it here. You can also assign one later.'}
                    action={<><Button href="/programs/templates" variant="secondary" onClick={onClose}>
                      Go to programs
                    </Button></>}
                    style={{ minHeight: 240, ['--i' as string]: 0 }}
                  />
                ) : (
                  <div style={{ ['--i' as string]: 0 }}>
                    <Sec
                      k="Choose a plan"
                      n={
                        weekdays.size > 0
                          ? `${weekdays.size} training day${weekdays.size > 1 ? 's' : ''} · the schedule you just set`
                          : `${eligibleTemplates.length} available`
                      }
                    />
                    <div className="lgl">
                      {eligibleTemplates.map(t => {
                        const active = selectedTemplateId === t.id;
                        return (
                          <button
                            key={t.id}
                            className="lrow"
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelectedTemplateId(active ? null : t.id)}
                          >
                            <span className={`rad${active ? ' rad--on' : ''}`} />
                            <span className="lrow__m">
                              <span className="lrow__t">{t.name}</span>
                              {(t.goal || t.description) && (
                                <span className="lrow__s">{t.goal ?? t.description}</span>
                              )}
                            </span>
                            {t.dayLabels && <Tag>{t.dayLabels.length} days</Tag>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="adrawer__foot">
          {step === 1 && (
            <>
              <Button
                variant="primary"
                className="adfoot__go"
                disabled={submitting}
                onClick={() => void handleStep1Continue()}
              >
                {submitting ? 'Saving…' : <>{createdClientId ? 'Save and continue' : 'Continue'} <ArrowIcon /></>}
              </Button>
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="primary"
                className="adfoot__go"
                disabled={submitting}
                onClick={() =>
                  void (createdClientId ? handleStep2Save() : handleCreateClient(true, true))
                }
              >
                {submitting
                  ? 'Saving…'
                  : <>{createdClientId ? 'Save and continue' : 'Continue'} <ArrowIcon /></>}
              </Button>
              <Button variant="ghost" disabled={submitting} onClick={() => goStep(1)}>
                Back
              </Button>
              {/* The Skip is about CREATING with less, so it goes once there is
                  nothing left to create — on a return visit the only thing it
                  could mean is *discard my edits*, and Back already does that
                  without claiming to be a step. */}
              {!createdClientId && (
              <Button
                variant="ghost"
                disabled={submitting}
                onClick={() => void handleCreateClient(false, false)}
                /* The name is the whole sentence at EVERY width; only the ink
                   changes. Below 900px the clause is 238px of a 360px foot and
                   it restates the `.why` card sixty pixels above it — an eye
                   has already read it there, a screen reader has not. Visible
                   text is a subset of the name, so SC 2.5.3 holds. */
                aria-label="Skip — sell it on the day they pay"
              >
                {/* TWO SPANS, ONE EVER VISIBLE, and that is not fussiness.
                    `.btn` is `inline-flex` with `gap:7px` for an icon beside a
                    label, so a label split into a text node plus a span becomes
                    two flex ITEMS and the 7px gap replaces the word space —
                    the `.msg` / `.who` / `.kv` trap this project has recorded
                    three times, and it was live on the desk for one commit.
                    Exactly one of these is ever `display:none`'d away, so the
                    button always holds a single flex item and no width pays a
                    gap it did not ask for. */}
                <span className="adfoot__short">Skip</span>
                <span className="adfoot__why">Skip — sell it on the day they pay</span>
              </Button>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <Button
                variant="primary"
                className="adfoot__go"
                disabled={submitting}
                onClick={() => void handleStep3Continue()}
              >
                {submitting ? 'Saving…' : <>Continue <ArrowIcon /></>}
              </Button>
              <Button variant="ghost" disabled={submitting} onClick={() => goStep(2)}>
                Back
              </Button>
              <Button
                variant="ghost"
                disabled={submitting}
                onClick={() => goTo(4)}
              >
                Skip for now
              </Button>
            </>
          )}

          {step === 4 && (
            <>
              {eligibleTemplates.length > 0 && selectedTemplateId && (
                <Button
                  variant="primary"
                  className="adfoot__go"
                  disabled={submitting}
                  onClick={() => void handleApplyTemplate()}
                >
                  {submitting ? 'Applying…' : <>Apply and finish <ArrowIcon /></>}
                </Button>
              )}
              <Button variant="ghost" disabled={submitting} onClick={() => goStep(3)}>
                Back
              </Button>
              <Button
                variant="ghost"
                disabled={submitting}
                onClick={goToClient}
              >
                {selectedTemplateId ? 'Skip for now' : 'Finish'}
              </Button>
            </>
          )}

          {shell === 'drawer' && (
            <span className="adfoot__esc"><kbd>Esc</kbd> closes</span>
          )}
        </div>
    </>
  );

  /* ── the two shells ── */

  if (shell === 'drawer') {
    return (
      <>
        {/* The scrim is the dialog's second way out, and it is the drawer's
            alone: a route has no outside to click. */}
        <button
          className="scrim scrim--soft"
          type="button"
          aria-label="Close drawer"
          onClick={cancel}
        />
        <div className="adrawer acflow" role="dialog" aria-modal="true" aria-label="Add a client">
          {flow}
        </div>
      </>
    );
  }

  /* The route. `.main` is a flex column with `overflow:hidden`, so a child that
     takes the remaining track gives the body its scroller and the foot its
     floor for free — the same three-part box the dialog has, without being one.
     No scrim and no `aria-modal`: the tab bar and the rail stay live, because
     this IS a destination and the shell around it is not covered. */
  return <div className="acflow acflow--page">{flow}</div>;
}
