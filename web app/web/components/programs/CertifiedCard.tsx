'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { CertifiedWire } from '@/lib/programs/api';
import { copyCertified } from '@/lib/programs/actions';
import { useToast } from '@/lib/toast/store';
import { daysOf, toEntries, weekCountOf } from '@/lib/programs/blueprint';
import { EQUIPMENT, LEVELS } from '@/lib/programs/certified';
import { CheckIcon, PlusIcon } from './Icons';
import { Button } from '@/web-components/ui/Button';
import { Tag } from '@/web-components/ui/Tag';
import { TemplateCard } from '@/web-components/ui/TemplateCard';

/**
 * ONE CERTIFIED PROGRAM, AS A CARD.
 *
 * The box is `ui/TemplateCard.tsx` — the same import `/library/c-templatecard`
 * renders, so the catalogue and this screen cannot drift. This file is what the
 * component deliberately has none of: the copy action, the router push, the
 * toast, and the reading of a wire row into six slots.
 *
 * `.lrow` is the right density for choosing between six programs a trainer
 * wrote and knows by name. It is the wrong density for choosing between forty
 * they have never seen, because the deciding information there is a SENTENCE —
 * who it is for, and what it does — and a sentence does not fit on a 44px row
 * beside a shape strip and a week count. So the certified shelf is cards and
 * `/programs` stays a list.
 *
 * ── THE HEADER SLOT HOLDS ONE THING, AND ONLY WHEN IT SAYS SOMETHING ─────────
 *
 * It used to hold `By InclineYou` on every card that was not already copied —
 * four of five — under a page whose own subtitle reads *written and reviewed by
 * certified trainers*. A badge on ~100% of rows carries no bits, and this one
 * cost the card's most valuable 90px to say what the `<h1>` had already said.
 *
 * What goes there instead is whatever varies:
 *
 *   `mine`     *You have a copy* — the state that changes both verbs below.
 *   `topUsed`  *Most used* — on the ONE card `rank()` put first.
 *   neither    nothing at all.
 *
 * `mine` wins when a card is both. A trainer who already holds this blueprint
 * is being told what to press, which is a fact about them; *most used* is a
 * fact about everybody else, and it is the one they need only while choosing.
 *
 * ── AND *REVIEWED* IS ON THE CARD NOW, NOT ONLY ON THE PREVIEW ───────────────
 *
 * `CertifiedMetaWire.reviewedAt` carries its own argument: *a blueprint with no
 * review date is an assertion; one with a date is a claim.* It was printed on
 * the preview header and nowhere on the card — so the claim was only available
 * to a trainer who had already decided to go and read one. It is in the footer,
 * beside the use count, because both are the same question: has anybody stood
 * behind this.
 *
 * ── READING COMES BEFORE COPYING ─────────────────────────────────────────────
 *
 * *Use this* was once the only weighted control on the card, which put the
 * loudest thing on the screen on the act that writes twenty rows onto the
 * trainer's shelf and increments a public counter, while the reversible act —
 * go and read it — was a ghost. So *Preview* is a secondary and *Use this* stays
 * the primary. Both are still one click; what changed is which one looks like
 * the obvious next move.
 *
 * Each control names its program in its accessible name, because forty buttons
 * all reading "Use this" is forty identical stops in a screen reader's rotor.
 *
 * ── AND *YOU HAVE A COPY* DEMOTES THE PRIMARY ────────────────────────────────
 *
 * A trainer who has already copied Push/Pull/Legs almost never wants a second
 * one — they want the one they edited. So the primary becomes *Open your copy*
 * and the duplicate path stays available but quiet. It is the single state that
 * stops a shelf filling up with three near-identical PPLs.
 */
export function CertifiedCard({ row, topUsed }: { row: CertifiedWire; topUsed?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  /* Derived rather than read: the list response carries no blueprint, so
     `daysOf` falls back to `trainingDays` — which is the authority anyway, and
     the fallback the second law calls a fallback. */
  const entries = toEntries(row.exercises);
  const days = daysOf(row, entries);
  const weeks = weekCountOf(row, entries);
  const meta = row.certified;
  const mine = row.mine;

  function use() {
    setError(null);
    start(async () => {
      const result = await copyCertified(row.id);
      if (result.ok) {
        /* THE CONFIRM IS RAISED BEFORE THE NAVIGATION, and it survives it —
           which is the whole reason the deck is mounted in the shell rather
           than on a screen. This used to push `?copied=1` and have the builder
           seed a `.pg__flash` band from it: a full-width strip that shifted the
           board down, existed only because the action navigates, and had to be
           re-read out of the URL on the other side. The card outlives the route
           change on its own, so the parameter and the band are both gone.

           A notice rather than a receipt: a trainer copying one program often
           copies three, and the fourth must not bury the first. */
        show({
          tone: 'ok',
          title: <>Copied into your programs</>,
          body: (
            <>
              {result.value.name} &mdash; the certified original is untouched.
            </>
          ),
        });
        // Straight into the builder, not back to the list. The next thing a
        // trainer does with a copied program is change something in it, and
        // landing on a list makes them find the thing they just made.
        router.push(`/programs/${result.value.id}`);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <TemplateCard
      name={row.name}
      href={`/programs/certified/${row.id}`}
      mine={Boolean(mine)}
      tag={
        mine ? (
          <Tag tone="ok">
            <CheckIcon size={11} />
            You have a copy
          </Tag>
        ) : topUsed ? (
          /* The tint `By InclineYou` used to wear, spent on the one card where
             it is a fact rather than a letterhead. `.cert__count` states the
             ordering this badge is the head of, so the claim is anchored to
             something the trainer can read two lines above the grid. */
          <Tag tone="acc">Most used</Tag>
        ) : undefined
      }
      summary={meta?.summary}
      /* Three figures, each with the noun it is OF. What the seven-cell `.shape`
         strip used to draw: *slots 1, 2 and 3 of a possible 7*, which on a
         blueprint nobody has scheduled yet is `3 days` said twice — see the
         component's own block in §04. */
      spec={[
        { value: days.length, noun: days.length === 1 ? 'day a week' : 'days a week' },
        { value: weeks, noun: weeks === 1 ? 'week' : 'weeks' },
        {
          value: row.exerciseCount,
          noun: row.exerciseCount === 1 ? 'exercise' : 'exercises',
        },
      ]}
      tags={
        meta && (
          <>
            <Tag>{LEVELS[meta.level]}</Tag>
            <Tag>{EQUIPMENT[meta.equipment]}</Tag>
            {row.goal && <Tag>{row.goal}</Tag>}
          </>
        )
      }
      error={error}
      meta={
        mine ? (
          /* *Revised since* is a NOTICE and never a merge — the same refusal the
             template → program relationship makes one level down. The trainer's
             copy is untouched and stays untouched; what this says is that a
             newer version exists to copy separately if they want it. */
          <>
            Copied <b>{shortDate(mine.copiedAt)}</b>
            {mine.stale ? ' · revised since' : ''}
          </>
        ) : (
          <>
            Used by <b>{meta?.usedCount ?? 0}</b>
            {meta ? <> · reviewed {monthOf(meta.reviewedAt)}</> : null}
          </>
        )
      }
      actions={
        mine ? (
          <>
            {/* *PREVIEW* IS HERE TOO, and this is the state that needed it most.
                The line to the left of these controls reads *Copied 5 Jul ·
                revised since* — the card tells the trainer the original has
                moved and, before this, offered no way to look at what it now
                says. `Use again` copies it blind; `Open your copy` opens the
                version that is behind. Reading the original was the one thing
                the notice was asking for.

                Ghost rather than secondary here, unlike the branch below: three
                weighted controls on one footer is three primaries, and on this
                card the trainer's own copy is the thing they want. */}
            <Button
              href={`/programs/certified/${row.id}`}
              variant="ghost"
              size="sm"
              aria-label={`Preview the certified ${row.name}`}
            >
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-label={`Copy ${row.name} again`}
              onClick={use}
            >
              {busy ? 'Copying…' : 'Use again'}
            </Button>
            <Button href={`/programs/${mine.id}`} variant="secondary" size="sm">
              Open your copy
            </Button>
          </>
        ) : (
          <>
            <Button
              href={`/programs/certified/${row.id}`}
              variant="secondary"
              size="sm"
              aria-label={`Preview ${row.name}`}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              aria-label={`Use ${row.name} — copy it to my programs`}
              onClick={use}
            >
              {busy ? (
                'Copying…'
              ) : (
                <>
                  <PlusIcon size={13} />
                  Use this
                </>
              )}
            </Button>
          </>
        )
      }
    />
  );
}

/** `4 Aug`. The year is dropped: a copy older than a year is not a fact this
 *  footer is trying to be precise about, and the shelf row carries the date. */
function shortDate(at: number): string {
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** `Aug`. A review is a month's worth of claim, never a day's — *reviewed 4 Aug*
 *  invites the reader to work out how many days ago that was, which is not the
 *  question. The year is dropped for `shortDate`'s reason and because a
 *  blueprint reviewed in another year is one the catalogue should have retired,
 *  not one this line should be arguing about. */
function monthOf(at: number): string {
  return new Date(at).toLocaleDateString('en-IN', { month: 'short' });
}
