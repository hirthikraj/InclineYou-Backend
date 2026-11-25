import type { PortalHomeWire, SessionCardWire } from '@/lib/portal/home-api';
import { relativePast } from '@/lib/today/time';
import { StartRun } from '@/components/portal/workout/StartRun';
import { Calendar, Clock } from '@/components/shell/Icons';
import { Button } from '@/web-components/ui/Button';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { CoachNote } from '@/web-components/ui/CoachNote';
import { HeroCard } from '@/web-components/ui/HeroCard';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Meter } from '@/web-components/ui/Meter';
import { Tag } from '@/web-components/ui/Tag';
import { QrCode } from '@/web-components/ui/QrCode';
import { WeekDots, type WeekDay } from '@/web-components/ui/WeekDots';
import { upiPayLink } from '@/lib/money/upi';

/**
 * The client's home (api-contract 1.2, p-a2): one hero and the quiet blocks under it.
 *
 * ── BUILT FROM THE CATALOGUE, ON THE PORTAL'S OWN COLUMN ─────────────────────
 *
 * The first cut on the real API drew every block as a bare `Card` with a private `.pth` family, left-aligned at 720px while every
 * other portal screen sits in the centred `.portal` column — so Home's header and cards started at a different x from the screen one
 * tab over. It is back on `.portal--home` / `.phome` (the two-column split `app.css` already carries, a PREFIX and a SUFFIX so the
 * phone reads §1's order unchanged) and on the components the catalogue has for exactly these jobs: `HeroCard` for the one thing to
 * do, `CoachNote` for the trainer's line (spec: *"with their name and photo"* — the initials avatar stands in, there is no image
 * store), `ListRow` for a dated row, `Meter` for a pack.
 *
 * ── THE ORDER ────────────────────────────────────────────────────────────────
 *
 * Column A, what to do: hero → an open assessment (the only other thing the client is being ASKED to do, so second, and a
 * `secondary` verb — §1 allows one primary) → the trainer's note → this week. Column B, how it went and what is left: the last
 * session → a milestone → the pack. Every block but the hero is ABSENT when the client does not have it — never an empty state.
 *
 * ── NEVER SHAME ──────────────────────────────────────────────────────────────
 *
 * No block is built around an absence. The week is a count that resets (*2 of 4*), its sentence is never a reproach, a late
 * assessment is *still open* rather than overdue, and nothing here carries `--tx-danger`.
 *
 * Dates are the client's own: the server names their zone and every time here is formatted in it.
 */

export type HomeWeek = {
  done: number;
  planned: number;
  week: number;
  weeks: number;
  /** This programme week's places, in order, with when each was done or is booked (21 Nov 2026). */
  days: { name: string; state: 'done' | 'booked' | 'next' | 'todo'; at: number | null; sessionId: string | null }[];
};

/** What the client owes and where to pay it — `/v1/portal/money`, only when visible and positive. */
export type HomePay = {
  amountDue: number;
  currency: string;
  payTo: string | null;
  /** V50 · set for a gym client, who pays the gym's desk — never the trainer's UPI ID. */
  gymName?: string | null;
  /** V50 · the total of their "I've paid" reports still waiting for the trainer. */
  waiting?: number;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function when(ms: number, zone: string): { day: string; time: string } {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(d);
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(d).toLowerCase();
  return { day, time };
}

function dayKey(ms: number, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date(ms));
}

/** *Today*, *Tomorrow*, or the short date — the word a person would use. */
function dayWord(ms: number, now: number, zone: string): string {
  const k = dayKey(ms, zone);
  if (k === dayKey(now, zone)) return 'Today';
  if (k === dayKey(now + 86_400_000, zone)) return 'Tomorrow';
  return when(ms, zone).day;
}

/** A `yyyy-MM-dd` as a calendar date. Parsed at UTC noon and printed in UTC so no zone can move it across midnight. */
function dateOnly(iso: string, withYear = false): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

function where(s: SessionCardWire): string | null {
  return s.place ?? (s.mode === 'online' ? 'Online' : null);
}

function Hero({ home, first, whatsappUrl }: { home: PortalHomeWire; first: string; whatsappUrl: string | null }) {
  const { hero, now, timezone: zone } = home;

  if (hero.kind === 'session' && hero.session) {
    const s = hero.session;
    const day = dayWord(s.scheduledAt, now, zone);
    const t = when(s.scheduledAt, zone).time;
    const place = where(s);
    const detail = [day, `${s.durationMinutes} min`, place].filter(Boolean).join(' · ');
    return (
      <HeroCard
        lead
        kicker={`${day === 'Today' ? 'Today' : 'Next'} with ${first}`}
        figure={t}
        name={s.workoutName ?? `Session with ${first}`}
        detail={detail}
        label={`${day} with ${first}, at ${t}. ${s.workoutName ?? 'Session'}. ${detail}.`}
        band={{ icon: <Calendar size={16} />, text: `${first} logs this one with you — just turn up.` }}
        actions={
          s.rescheduleUrl ? (
            <Button variant="secondary" href={s.rescheduleUrl} target="_blank" rel="noopener noreferrer">
              Ask to move it
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (hero.kind === 'selfRun' && hero.workout) {
    const w = hero.workout;
    const detail = [
      w.week && w.day ? `Week ${w.week} · Day ${w.day}` : null,
      `${w.exerciseCount} ${w.exerciseCount === 1 ? 'exercise' : 'exercises'}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <HeroCard
        lead
        /* `live` only while a log is open: it is the one state on this card that is happening now. */
        live={!!hero.resume}
        kicker={hero.resume ? 'In progress' : 'Your workout today'}
        /* THE WORKOUT IS THE HEADLINE (21 Nov 2026). It led with *~40 min*, which answered how long before what: the
           name is what a client recognises and decides on, and the minutes are a detail beside the exercise count. */
        name={w.name}
        detail={`${detail} · ~${w.estimatedMinutes} min`}
        label={`${hero.resume ? 'In progress' : 'Your workout today'}. ${w.name}, about ${w.estimatedMinutes} minutes. ${detail}.`}
        band={hero.resume ? { icon: <Clock size={16} />, tone: 'acc', text: 'Everything you logged is saved — pick up where you left off.' } : undefined}
        actions={<StartRun workoutId={w.id} resumeSessionId={hero.resume?.sessionId} />}
      />
    );
  }

  if (hero.kind === 'rest') {
    const n = hero.nextSession;
    const nextLine = n
      ? `Next: ${dayWord(n.scheduledAt, now, zone)} at ${when(n.scheduledAt, zone).time}${n.workoutName ? ` · ${n.workoutName}` : ''}`
      : null;
    return (
      <HeroCard
        quiet
        kicker="Rest day"
        name="Recovery is part of the plan."
        detail="Rest is when the training lands. Nothing is asked of you today."
        label={`Rest day. Recovery is part of the plan.${nextLine ? ` ${nextLine}.` : ''}`}
        band={nextLine ? { icon: <Calendar size={16} />, text: nextLine } : undefined}
        actions={
          <Button variant="ghost" href="/me/plan">
            See your week
          </Button>
        }
      />
    );
  }

  return (
    <HeroCard
      quiet
      kicker="Welcome"
      name={`${first} is setting up your plan.`}
      detail="Your sessions and workouts appear here as soon as they do."
      label={`Welcome. ${first} is setting up your plan.`}
      actions={
        whatsappUrl ? (
          <Button variant="primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            Say hello to {first}
          </Button>
        ) : undefined
      }
    />
  );
}

/** A sentence under the week that is never a reproach. */
function weekLine(w: HomeWeek): string {
  if (w.done >= w.planned) return 'That’s the week. Anything more is a bonus.';
  if (w.done === 0) return 'A fresh week — your first one is waiting.';
  return `${w.planned - w.done} to go — nice going.`;
}

/**
 * YOUR WEEK, AS DAYS AND AS WORKOUTS (21 Nov 2026).
 *
 * It was a bar at *0 of 3* — no *which* and no *when*, and an empty bar reads as falling behind. Now it is the
 * calendar week as `WeekDots` (the done days lime, the booked days ringed, today marked; a count, never a streak),
 * and under it this programme week's workouts by name with what each one is: done and when, booked and when, up
 * next, or to do. The dates come from the plan's places (`at`, added to `/v1/portal/plan` for this). A place not yet
 * reached has no date, so it is in the list and not on a day — the strip never invents a day for it.
 */
function WeekCard({ week, now, zone }: { week: HomeWeek; now: number; zone: string }) {
  /* THE STRIP IS THE WEEK THE ROWS ARE ABOUT (22 Nov 2026). It was always the calendar week holding TODAY, while the count
     and the rows are the PROGRAM's week, which starts on the programme's own start weekday. On a Sunday with a Saturday
     start they were different weeks: the strip lit Mon 16 – Sun 22 and read *0 of 3* beside two sessions trained that
     week, over rows dated 23–27. The strip now centres on the program week's first dated session (today when none is
     dated), and today is lit only when it is inside it. */
  const weekdayOf = (t: number) =>
    WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone }).format(new Date(t)));
  const dated = week.days.map((d) => d.at).filter((t): t is number => t != null);
  const anchor = dated.length > 0 ? Math.min(...dated) : now;
  const anchorIdx = weekdayOf(anchor);
  const todayKey = dayKey(now, zone);
  const strip: WeekDay[] = WEEKDAYS.map((_, i) => {
    const key = dayKey(anchor + (i - anchorIdx) * DAY_MS, zone);
    const on = week.days.filter((d) => d.at != null && dayKey(d.at, zone) === key);
    const done = on.find((d) => d.state === 'done');
    const booked = on.find((d) => d.state === 'booked');
    return {
      letter: WEEKDAYS[i][0],
      name: WEEKDAY_NAMES[i],
      state: done ? 'done' : booked ? 'plan' : 'rest',
      today: key === todayKey,
      href: done?.sessionId ? `/me/session/${done.sessionId}` : booked ? '/me/plan' : undefined,
    };
  });

  const GLYPH: Record<HomeWeek['days'][number]['state'], string> = { done: '✓', booked: '•', next: '→', todo: '' };
  const subOf = (d: HomeWeek['days'][number]) =>
    d.state === 'done'
      ? `Done${d.at != null ? ` · ${dayWord(d.at, now, zone)}` : ''}`
      : d.state === 'booked'
        ? d.at != null ? `${dayWord(d.at, now, zone)} at ${when(d.at, zone).time}` : 'Booked'
        /* WHICH *NEXT* (25 Nov 2026). `next` is the next workout in the PLAN's order; the card above says *Next*
           for the next BOOKED session. With Friday booked as Full body, *Lower body · Up next* told a client two
           different things were next. So a workout says whether it is booked: the plan's next one, unbooked,
           is *Next in your plan · not booked*; the rest are *Not booked yet*. A booked one keeps its date. */
        : d.state === 'next' ? 'Next in your plan · not booked' : 'Not booked yet';

  return (
    <Card>
      <CardHead title="Your week">
        {/* The week's count is the strip's own (*0 of 3 this week*), one line below; said here as well it was twice. */}
        <span className="small ink3">
          Week {week.week} of {week.weeks}
        </span>
      </CardHead>
      <CardBody>
        <WeekDots days={strip} done={week.done} planned={week.planned} />
        <p className="small ink2 mt2">{weekLine(week)}</p>
      </CardBody>
      <CardBody flush divided>
        <ListRows label="This week’s workouts">
          {week.days.map((d, i) => (
            <ListRow
              key={`${d.name}-${i}`}
              href={d.state === 'done' && d.sessionId ? `/me/session/${d.sessionId}` : '/me/plan'}
              avatar={<span className={`phwk__s phwk__s--${d.state}`} aria-hidden="true">{GLYPH[d.state]}</span>}
              title={d.name}
              sub={subOf(d)}
            />
          ))}
        </ListRows>
      </CardBody>
    </Card>
  );
}

/**
 * WHAT IS OWED, AND ONE STEP TO PAY IT (21 Nov 2026). The UPI link (`upiPayLink`, the NPCI deep link every UPI app
 * opens with the payee and amount filled in) on a phone; on a desk, where there is no UPI app to open, the same link as
 * a QR code (`c-qrcode`) for the phone's camera, and the UPI ID in words. Nothing moves through InclineYou: the client
 * approves it in their own app and the trainer marks it paid, which the card says. Absent unless something is owed.
 */
function PayCard({ pay, first }: { pay: HomePay; first: string }) {
  const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: pay.currency, maximumFractionDigits: 0 }).format(pay.amountDue);
  const link = pay.payTo
    ? upiPayLink({ vpa: pay.payTo, payeeName: first, amount: pay.amountDue, currency: pay.currency, note: 'Training package' })
    : null;
  return (
    <Card>
      <CardHead title="To pay">
        <span className="small ink3">to {first}</span>
      </CardHead>
      <CardBody>
        <p className="phpay__amt">{amount}</p>
        {pay.waiting ? (
          <p className="small ink2 mt2">
            You told {first} you paid {new Intl.NumberFormat('en-IN', { style: 'currency', currency: pay.currency, maximumFractionDigits: 0 }).format(pay.waiting)} —
            waiting for them to confirm it.
          </p>
        ) : null}
        {link ? (
          <>
            <p className="small ink2 mt2">
              Left on your package. Paid? Tap <b>I’ve paid</b> so {first} can confirm it.
            </p>
            <div className="phpay__phone mt3">
              <Button variant="primary" href={link}>Pay {amount} with UPI</Button>
            </div>
            <div className="phpay__desk mt3">
              <QrCode value={link} label={`UPI payment code for ${amount} to ${first}`} size={152} />
              <p className="small ink2">
                Scan with any UPI app on your phone — the amount is filled in.
                <br />
                UPI ID <b className="ink mono">{pay.payTo}</b>
              </p>
            </div>
          </>
        ) : pay.gymName ? (
          <p className="small ink2 mt2">Left on your package. Pay at {pay.gymName}’s desk, then tap <b>I’ve paid</b> so {first} can confirm it.</p>
        ) : (
          <p className="small ink2 mt2">Left on your package. Settle it with {first} directly, then tap <b>I’ve paid</b>.</p>
        )}
        <p className="mt3">
          <Button variant="secondary" href="/me/payments?report=1">I’ve paid</Button>
        </p>
      </CardBody>
    </Card>
  );
}

/** A win from the last three days, at the top — a new milestone, else the newest best. Absent when there is none. */
function Win({ home, now }: { home: PortalHomeWire; now: number }) {
  const recent = 3 * DAY_MS;
  const ms = home.recentMilestone && now - home.recentMilestone.at < recent ? home.recentMilestone : null;
  const r = home.lastRecap && now - home.lastRecap.at < recent && home.lastRecap.newBests.length > 0 ? home.lastRecap : null;
  if (!ms && !r) return null;
  const best = r?.newBests[0];
  return (
    <Card tone="acc" className="phome__win">
      <CardBody>
        <p className="phome__winl">
          <Tag tone="pr">{ms ? 'Milestone' : 'New best'}</Tag>
          <span>
            {ms
              ? ms.label
              : `${best!.name} — ${best!.loadValue} kg${best!.effortValue ? ` × ${best!.effortValue}` : ''}`}
            {!ms && r && r.newBests.length > 1 ? <span className="ink3"> · +{r.newBests.length - 1} more</span> : null}
          </span>
        </p>
      </CardBody>
    </Card>
  );
}

export function HomeView({
  home,
  week,
  pay,
  moneyVisible = false,
  whatsappUrl,
}: {
  home: PortalHomeWire;
  /** This programme week's count, or null where there is no programme (or the plan read failed). */
  week: HomeWeek | null;
  /** What is owed and where to pay it, or null. */
  pay: HomePay | null;
  /** V50 · whether this client sees money at all — the pack card offers *I've paid* only then. */
  moneyVisible?: boolean;
  /** The trainer's bare `wa.me` link, from `/v1/portal/me`. Logs nothing. */
  whatsappUrl: string | null;
}) {
  const { trainer, now, timezone: zone } = home;
  const first = trainer.name.split(' ')[0];
  const a = home.assessments;
  const m = home.message;
  const r = home.lastRecap;
  const pack = home.package;

  return (
    <div className="portal portal--home col gap4">
      <div className="phome">
        {/* THE ORDER (21 Nov 2026): a fresh win first (absent otherwise), then the one thing to do today, then the
            week, the trainer's note, and what is asked or owed. Column B is how the last session went and the pack. */}
        <div className="phome__a col gap4">
          <Win home={home} now={now} />
          <Hero home={home} first={first} whatsappUrl={whatsappUrl} />

          {week && <WeekCard week={week} now={now} zone={zone} />}

          {a && (
            <Card>
              <CardHead title="Your assessment">
                <span className="small ink3">from {first}</span>
              </CardHead>
              <CardBody flush>
                <ListRows label="Assessment waiting for you">
                  <ListRow
                    href={`/me/assessments/${a.next.id}`}
                    title={a.next.name}
                    sub={a.late > 0 ? 'Still open — whenever you’re ready' : `Due ${dateOnly(a.next.dueOn)}`}
                    right={a.late > 0 ? <Tag>Late</Tag> : undefined}
                    rightInline
                  />
                </ListRows>
              </CardBody>
              <CardBody divided>
                <Button variant="secondary" href={`/me/assessments/${a.next.id}`}>
                  Fill it in
                </Button>
                {a.open > 1 && (
                  <p className="small mt3">
                    <InlineLink href="/me/progress/assessments">
                      {a.open - 1} more waiting
                    </InlineLink>
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {m && (
            <Card>
              <CardHead title={m.kind === 'weekly' ? `${first}’s weekly note` : `From ${first}`}>
                {!m.readAt && <Tag tone="acc">New</Tag>}
                <span className="small ink3">{relativePast(m.at, now)}</span>
              </CardHead>
              <CardBody>
                <CoachNote
                  author={m.trainerName || trainer.name}
                  meta={
                    <>
                      <InlineLink href="/me/inbox">All messages</InlineLink>
                      {whatsappUrl && (
                        <>
                          {' · '}
                          <InlineLink href={whatsappUrl} newTab>
                            Reply on WhatsApp
                          </InlineLink>
                        </>
                      )}
                    </>
                  }
                >
                  {m.body}
                </CoachNote>
              </CardBody>
            </Card>
          )}

          {pay && <PayCard pay={pay} first={first} />}
        </div>

        <div className="phome__b col gap4">
          {r && (
            <Card>
              <CardHead title="Your last session">
                <span className="small ink3">{dayWord(r.at, now, zone)}</span>
              </CardHead>
              <CardBody>
                <p className="small ink2">
                  {r.setsDone} {r.setsDone === 1 ? 'set' : 'sets'}
                  {r.volumeKg > 0 ? ` · ${Math.round(r.volumeKg).toLocaleString('en-IN')} kg moved` : ''}
                </p>
                {r.newBests.length > 0 && (
                  <ul className="phome__bests mt3">
                    {r.newBests.map((b) => (
                      <li key={b.exerciseId}>
                        <Tag tone="pr">New best</Tag>
                        <span>
                          {b.name} — {b.loadValue} kg{b.effortValue ? ` × ${b.effortValue}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
              {r.message && (
                <CardBody divided>
                  <CoachNote author={trainer.name}>{r.message.body}</CoachNote>
                </CardBody>
              )}
              <CardBody divided>
                <p className="small">
                  <InlineLink href={`/me/session/${r.sessionId}`}>See the session</InlineLink>
                </p>
              </CardBody>
            </Card>
          )}


          {pack && (
            <Card>
              <CardHead title="Your pack">{pack.paused && <Tag>Paused</Tag>}</CardHead>
              <CardBody>
                <p className="small ink2">
                  {pack.sessionsLeft} of {pack.sessionsTotal} sessions left
                  {pack.expiresOn ? ` · until ${dateOnly(pack.expiresOn, true)}` : ''}
                </p>
                {pack.sessionsTotal > 0 && (
                  <div className="mt3">
                    {/* Fills with what is LEFT, so the bar agrees with the sentence above it. */}
                    <Meter
                      label={`${pack.sessionsLeft} of ${pack.sessionsTotal} sessions left`}
                      total={pack.sessionsTotal}
                      segments={[{ tone: 'ok', value: pack.sessionsLeft, label: 'left' }]}
                    />
                  </div>
                )}
                {/* "2 sessions left · renew" (23 Nov 2026): the client hears it before the pack runs out, not only the
                    trainer — the softest way to ask, and where autopay's top-up will later hook in. Paying ahead is
                    reported like any payment, and lands as an advance the trainer confirms into the next pack. */}
                {!pack.paused && pack.sessionsLeft <= 2 && (
                  <>
                    <p className="small mt2">
                      <b>{pack.sessionsLeft === 0 ? 'No sessions left' : `${pack.sessionsLeft} session${pack.sessionsLeft === 1 ? '' : 's'} left`} · time to renew.</b>{' '}
                      Talk to {first} about your next pack{moneyVisible ? ' — paid ahead already? Tell them.' : '.'}
                    </p>
                    {moneyVisible && !pay && (
                      <p className="mt2"><Button variant="secondary" size="sm" href="/me/payments?report=1">I’ve paid</Button></p>
                    )}
                  </>
                )}
                <p className="small mt3">
                  <InlineLink href="/me/package">Pack and payments</InlineLink>
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
