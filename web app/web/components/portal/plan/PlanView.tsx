import type { PlanDayWire, PlanWire } from '@/lib/portal/plan-api';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Tag } from '@/web-components/ui/Tag';

import { day, dayWord, when } from './format';

/**
 * Only the states worth a chip. *To do* was drawn on every future day, which on a twelve-week plan is thirty-odd identical grey
 * tags saying the obvious — a day that has not happened yet has not happened. Absent is the honest drawing of it.
 */
/* THE SAME FOUR STATES HOME DRAWS (21 Nov 2026): a glyph in the row's avatar slot — done the only lime — and the
   state in words with its date where the plan has one (`at`), instead of a coloured tag with no date. One reading
   of a day across the two screens a client moves between most. The glyph classes are Home's (`.phwk__s`). */
const GLYPH: Record<PlanDayWire['state'], string> = { done: '✓', booked: '•', next: '→', todo: '' };

/**
 * The Schedule tab (api-contract 1.2, pp-l1): what is coming. The trainer's sessions first — a client does not book, so each carries
 * a WhatsApp draft that names the session — then the plan, week by week. Done opens what was done; anything else opens the preview,
 * from which a self-run day is started. Nothing here is a score.
 *
 * ── 21 Nov 2026 ──────────────────────────────────────────────────────────────
 *
 *   · **In the `.portal` column**, like every other portal screen — it was a 720px left-aligned `.pl` under a header centred at 920.
 *   · **This week and next are open; the rest are folded.** Every week of the programme was a card of its own, so a twelve-week plan
 *     was twelve cards and the week the client is IN was found by scrolling past the ones they had finished. §4's question is *what
 *     is coming*: this week leads, next week under it, and the later and the earlier weeks are native `<details>` (`.disc`) — no
 *     state, no client JS, and every assistive technology already knows them.
 *   · **The arc has a `Meter`** — *Week 3 of 12* with a bar, Plan's own idiom (a sentence with a bar under it), where it was prose.
 *   · **Rows are `ListRow`s.** A session's date and time is the title (it is what a client scans for), and *Ask to move* stays per row
 *     because the draft names that one session (shortened from *Ask to move it*, which pushed the place out of the row at 320px).
 */
export function PlanView({
  plan,
  zone,
  trainerFirstName,
  whatsappUrl,
  now,
}: {
  plan: PlanWire;
  zone: string;
  trainerFirstName: string;
  /** The trainer's bare `wa.me` link, for the empty *Coming up* card. Logs nothing. */
  whatsappUrl: string | null;
  /** The server's instant, for *Today* and *Tomorrow*. */
  now: number;
}) {
  const prog = plan.program;
  const weeks = new Map<number, PlanDayWire[]>();
  for (const d of prog?.days ?? []) {
    const w = d.week ?? 0;
    weeks.set(w, [...(weeks.get(w) ?? []), d]);
  }
  const all = [...weeks.entries()].sort((a, b) => a[0] - b[0]);
  const cur = prog?.currentWeek ?? 0;
  const shown = all.filter(([w]) => w === 0 || w === cur || w === cur + 1);
  const later = all.filter(([w]) => w > cur + 1);
  const earlier = all.filter(([w]) => w !== 0 && w < cur);

  const weekCard = ([w, days]: [number, PlanDayWire[]]) => {
    const done = days.filter((d) => d.state === 'done').length;
    return (
      <Card key={w}>
        <CardHead title={w ? `Week ${w}` : 'Your days'}>
          {w === cur && <Tag tone="acc">This week</Tag>}
          {w === cur + 1 && <span className="small ink3">next week</span>}
          {w !== 0 && w <= cur && done > 0 && (
            <span className="small ink3">
              {done} of {days.length} done
            </span>
          )}
        </CardHead>
        <CardBody flush>
          <ListRows label={w ? `Week ${w}` : 'Your days'}>
            {days.map((d) => {
              const at = d.at ?? null;
              const sub =
                d.state === 'done'
                  ? `Done${at !== null ? ` · ${dayWord(at, now, zone)}` : ''}`
                  : d.state === 'booked'
                    ? at !== null ? `${dayWord(at, now, zone)} at ${when(at, zone).time}` : 'Booked'
                    /* Home's wording (25 Nov 2026): *Next session* at the top is the next BOOKED one, so the plan's
                       next workout, when it is not booked, does not also call itself *Up next*. */
                    : d.state === 'next'
                      ? 'Next in your plan · not booked'
                      : d.day ? `Day ${d.day}` : 'To do';
              return (
                <ListRow
                  key={`${d.workoutId}-${d.week}-${d.day}`}
                  href={d.state === 'done' && d.sessionId ? `/me/session/${d.sessionId}` : `/me/workout/${d.workoutId}`}
                  avatar={<span className={`phwk__s phwk__s--${d.state}`} aria-hidden="true">{GLYPH[d.state]}</span>}
                  title={d.name}
                  sub={sub}
                />
              );
            })}
          </ListRows>
        </CardBody>
      </Card>
    );
  };

  return (
    <div className="portal col gap4">
      {/* ── NEXT, NOT A SECOND LIST (22 Nov 2026) ─────────────────────────────────
         *Coming up* listed every booked session of the fortnight, and the week cards under it listed the same sessions
         again — three of six rows on this screen said the same thing twice, the second time without the date. The week
         cards carry every booked session's date now (the server's `booked` window matches `upcoming`'s fortnight), so
         this card holds the one session a client is asking about: the next. A booked session that is NOT on the plan
         (a one-off, an assessment) has no week card to be dated in, so it keeps its own row here. *Ask to move it* is a
         button on the row, not a link under it — six quiet links in a column read as boilerplate, and a week row
         cannot carry one: the row is already a link to the workout, and a link cannot hold a link. */}
      {(() => {
        const onPlan = new Set((prog?.days ?? []).map((d) => d.sessionId).filter(Boolean));
        const [next, ...rest] = plan.upcoming;
        const extra = rest.filter((s) => !onPlan.has(s.id));
        const dated = rest.length - extra.length;
        const row = (s: (typeof plan.upcoming)[number]) => (
          <ListRow
            key={s.id}
            title={`${dayWord(s.scheduledAt, now, zone)} · ${when(s.scheduledAt, zone).time}`}
            sub={[s.workoutName, `${s.durationMinutes} min`, s.place ?? (s.mode === 'online' ? 'Online' : null)].filter(Boolean).join(' · ')}
            right={
              s.rescheduleUrl ? (
                <Button variant="secondary" size="sm" href={s.rescheduleUrl} target="_blank" rel="noopener noreferrer">
                  Ask to move it
                </Button>
              ) : undefined
            }
            rightInline
          />
        );
        return (
          <Card>
            <CardHead title={next ? 'Next session' : 'Coming up'}>
              <span className="small ink3">booked by {trainerFirstName}</span>
            </CardHead>
            {!next ? (
              <CardBody>
                <p className="small ink2">
                  Nothing booked in the next two weeks. {trainerFirstName} books your sessions — your own days are below.
                </p>
                {whatsappUrl && (
                  <p className="small mt2">
                    <InlineLink href={whatsappUrl} newTab>
                      Message {trainerFirstName}
                    </InlineLink>
                  </p>
                )}
              </CardBody>
            ) : (
              <>
                <CardBody flush className="pplan__next">
                  <ListRows label="Booked for you">
                    {row(next)}
                    {extra.map(row)}
                  </ListRows>
                </CardBody>
                {dated > 0 && (
                  <CardBody divided>
                    <p className="small ink2">
                      {dated} more booked in the next two weeks — dated in your weeks below.
                      {whatsappUrl ? (
                        <>
                          {' '}
                          <InlineLink href={whatsappUrl} newTab>
                            Message {trainerFirstName}
                          </InlineLink>{' '}
                          to move one.
                        </>
                      ) : null}
                    </p>
                  </CardBody>
                )}
              </>
            )}
          </Card>
        );
      })()}

      {!prog ? (
        <EmptyState title="No plan yet" body={`When ${trainerFirstName} builds your program it appears here, week by week.`} />
      ) : (
        <>
          <Card>
            <CardHead title={prog.name}>{prog.status === 'paused' && <Tag>Paused</Tag>}</CardHead>
            <CardBody>
              <p className="small ink2">
                Week {Math.min(cur, prog.weeks)} of {prog.weeks}
                {prog.startDate ? ` · started ${day(prog.startDate)}` : ''}
                {prog.endDate ? ` · ends ${day(prog.endDate)}` : ''}
              </p>
              {prog.weeks > 0 && (
                <div className="mt3">
                  <Meter
                    label={`Week ${Math.min(cur, prog.weeks)} of ${prog.weeks}`}
                    total={prog.weeks}
                    /* A quantity, in the data tone — not lime, which is for what a client can press (25 Nov 2026). */
                    segments={[{ tone: 'data', value: Math.min(Math.max(cur, 0), prog.weeks), label: 'weeks in' }]}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          {shown.map(weekCard)}

          {later.length > 0 && (
            <details className="disc pplan__fold">
              <summary className="disc__s">
                {later.length === 1 ? `Week ${later[0][0]}` : `Weeks ${later[0][0]}–${later[later.length - 1][0]}`}
              </summary>
              <div className="col gap4 mt3">{later.map(weekCard)}</div>
            </details>
          )}

          {earlier.length > 0 && (
            <details className="disc pplan__fold">
              <summary className="disc__s">
                {earlier.length === 1 ? `Earlier: week ${earlier[0][0]}` : `Earlier weeks · ${earlier[0][0]}–${earlier[earlier.length - 1][0]}`}
              </summary>
              <div className="col gap4 mt3">{[...earlier].reverse().map(weekCard)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
