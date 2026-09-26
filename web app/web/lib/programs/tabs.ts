import type { PageTab } from '@/components/shell/PageTabs';

/**
 * THE TWO STRIPS ABOVE FITNESS' FIRST PAGE, AND WHY THERE ARE TWO.
 *
 * ── WHAT CHANGED, 22 SEP 2026 ────────────────────────────────────────────────
 *
 * The strip used to read *Programs · Templates* over two shelves of BLUEPRINTS:
 * the trainer's own at `/programs`, and the InclineYou catalogue at
 * `/programs/certified`. Both answered *which blueprint do I start from*, which
 * is what made them one page seen twice, and the argument for that is intact —
 * it is reproduced under `TEMPLATE_TABS` below, because it is still the reason
 * those two sit on one strip.
 *
 * What it got wrong was the WORD. *Programs* named the shelf of things a
 * trainer has written, and a program in this product is the thing a client is
 * actually on — `POST /v1/templates/{id}/apply` copies a blueprint into
 * `program` and from that moment the two are independent, which is the whole of
 * *a copy is a copy*. So the section's first page was a list of blueprints
 * under the name of the copies, and the copies themselves had no list at all:
 * they were reachable one client at a time, through that client's file.
 *
 * Now the top strip splits the two nouns —
 *
 *   Programs   `/programs`             every client's copy, filtered by client
 *   Templates  `/programs/templates`   the blueprints, in two shelves
 *
 * — and the SECOND strip, drawn only under Templates, is the old pair with the
 * old argument and one renamed label.
 *
 * ── THIS STILL NARROWS `nav.tsx`'s RULE, AND STILL DELIBERATELY ──────────────
 *
 * `nav.tsx` argues that a tab strip above a page is *only ever views of this
 * page*, which is what deleted `components/programs/tabs.tsx` and moved section
 * navigation into the pane. Both strips here cross a route and both are views:
 * the top one asks *which of my two nouns* of one subject — the blueprint and
 * the copy are the same plan read at two altitudes, and every row on either
 * strip is a program row with the same columns — and the lower one asks *whose
 * shelf* of one question.
 *
 * The pane is still three rows. *Templates* never became a fourth.
 *
 * ── `/programs/templates` IS A THIRD STATIC CHILD ────────────────────────────
 *
 * `app/(main)/programs/page.tsx` warns that a sibling STATIC segment beats
 * `[templateId]` by the App Router's own precedence, and that it is safe only
 * because a template id is a uuid and can never be either literal string. There
 * are THREE of them now — `exercises`, `certified`, `templates` — and the third
 * is safe for the identical reason. The mock's router carries the same ordering
 * one layer down, where the check is manual.
 *
 * ── THE ROUTE KEEPS ITS OLD NAME AND THE LABEL DOES NOT ──────────────────────
 *
 * `/programs/certified`, still, under the label *InclineYou templates*. The
 * segment is what four surfaces index on — the mock's router, `FirstRun`'s
 * *See all N templates* link, every seeded `copiedFrom`, and the App Router's
 * own precedence — and renaming both at once is two migrations for one
 * decision. Same trade `nav.tsx` makes when it renames the rail row to
 * *Fitness* and keeps the key `prog`.
 */
export type ProgramsTabKey = 'programs' | 'templates';

export const PROGRAMS_TABS: { key: ProgramsTabKey; label: string; href: string }[] = [
  { key: 'programs', label: 'Programs', href: '/programs' },
  { key: 'templates', label: 'Templates', href: '/programs/templates' },
];

/**
 * THE TWO SHELVES, AND THE ARGUMENT THAT PUT THEM ON ONE STRIP.
 *
 * *Templates* was a row of the Fitness pane — a PAGE of the section, beside
 * Programs, Workouts and the exercise library. It is a tab, and this strip is
 * the only place either shelf is reachable from.
 *
 * The question is whether these two are one page seen twice or two places — and
 * they are one page. Both answer *which blueprint do I start from*: same row,
 * same shape strip, same week count, same goal. What differs is WHOSE shelf it
 * is and therefore the verb — *Open* on the trainer's own, *Use this* on one
 * they have to copy first. A strip that switches the source of a list and keeps
 * the question is the definition `nav.tsx`'s rule was written to protect, not
 * an exception to it.
 *
 * ── THE LABELS SAY WHOSE, BECAUSE THE STRIP ABOVE TOOK THE SHORT WORDS ───────
 *
 * *Mine* and *Certified* were the shapes considered. *Mine* is what every other
 * product calls this and is one word shorter; it loses to *My templates*
 * because this strip sits directly under one that says *Templates*, and a lower
 * strip reading *Mine · InclineYou* asks the reader to carry the noun down from
 * the row above. *Certified* loses to *InclineYou templates* for the reason the
 * certified shelf exists at all: the fact a trainer is being offered is not that
 * somebody certified these, it is WHO — there is one publisher, no marketplace,
 * and the name is the guarantee.
 */
export type TemplateTabKey = 'mine' | 'certified';

export const TEMPLATE_TABS: { key: TemplateTabKey; label: string; href: string }[] = [
  { key: 'mine', label: 'My templates', href: '/programs/templates' },
  { key: 'certified', label: 'InclineYou templates', href: '/programs/certified' },
];

/**
 * The top strip, with a count on whichever tab is not the one you are reading.
 *
 * A count on the CURRENT tab is a figure the page below it already states — the
 * shelf's own subtitle says what is on it — so it is dropped rather than drawn
 * twice. On the other tab it is the one thing the strip can say that the page
 * cannot: how much is over there.
 *
 * `PageTabs` omits a zero by contract, which is the behaviour this wants at
 * both ends: *Templates 0* is a badge spent saying the catalogue failed to
 * load, and `null` is what a failed read passes.
 */
export function programsTabs(
  current: ProgramsTabKey,
  counts: Partial<Record<ProgramsTabKey, number | null>> = {},
): PageTab[] {
  return PROGRAMS_TABS.map(t => ({
    key: t.key,
    label: t.label,
    href: t.href,
    count: t.key === current ? null : counts[t.key] ?? null,
  }));
}

/**
 * The lower strip. Same contract, same reason — a count is drawn on the shelf
 * you are not looking at and never on the one you are.
 */
export function templateTabs(
  current: TemplateTabKey,
  counts: Partial<Record<TemplateTabKey, number | null>> = {},
): PageTab[] {
  return TEMPLATE_TABS.map(t => ({
    key: t.key,
    label: t.label,
    href: t.href,
    count: t.key === current ? null : counts[t.key] ?? null,
  }));
}
