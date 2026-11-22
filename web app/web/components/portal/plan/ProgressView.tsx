import type { ProgressWire } from '@/lib/portal/plan-api';
import { exerciseHref } from '@/lib/portal/progress-tabs';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Change } from '@/web-components/ui/Change';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { InlineLink } from '@/web-components/ui/InlineLink';
import { ListRow, ListRows } from '@/web-components/ui/ListRow';
import { Stat, Stats } from '@/web-components/ui/Stat';
import { SubTabs } from '@/web-components/ui/SubTabs';
import { VolumeBars, type VolumeWeek } from '@/web-components/ui/VolumeBars';

import { num } from './format';

const LABEL: Record<number, string> = { 28: '4 weeks', 90: '3 months', 365: 'A year' };

/**
 * The Summary tab (api-contract 1.2, pp-l3): one sentence, the biggest jump as a `Change`, three figures that are each a door, and the
 * milestones. Every number in the sentence is a field of the response, so it can be checked against the logs and reworded without an
 * API deploy. It says what happened and never scores it — counts, no streaks, no target, no rate, nothing about a body.
 *
 * ── WHAT CHANGED, 21 Nov 2026 ───────────────────────────────────────────────
 *
 *   · **The range is `c-subtabs`**, not a row of primary/secondary buttons: each pill is a page load (the window is in the URL and
 *     the server reads it), which is exactly the promise `SubTabs` makes and `Segment` does not.
 *   · **The biggest jump is a `Change`** — *60 kg → 70 kg, 17% stronger* — where it was a sentence about an "estimated best set"
 *     with two e1rm figures in it. §1: the client is a 38-year-old accountant, not somebody who reads about one-rep maxes. The e1rm
 *     still decides WHICH lift; what is shown is the weight on the bar, or the reps where the weight did not move.
 *   · **The figures are `Stat` tiles with `href`**, where they were a hand-rolled `<dl>` and two `secondary` buttons under it —
 *     the tile is the door, so a number a client cannot open is never a number they have to take on trust.
 *   · **Milestones are rows with their date on the right** in the client's own zone; the date was an accent `Tag`, which is a
 *     status chip spent on a calendar fact, formatted in a hard-coded Asia/Kolkata.
 */
export function ProgressView({
  progress,
  windows,
  trainerFirstName,
  zone,
}: {
  progress: ProgressWire;
  windows: number[];
  trainerFirstName: string;
  /** The client's own zone, for the milestone dates. */
  zone: string;
}) {
  const { strength, consistency, milestones } = progress;
  const nothing = consistency.sessionsDone === 0 && strength.tracked === 0;
  const span = (LABEL[progress.windowDays] ?? `${progress.windowDays} days`).toLowerCase();

  /* ── THE RATE COUNTS FROM THEIR FIRST SESSION (22 Nov 2026) ────────────────
     Divided by the whole window, a client who started in August read *about 0.6 a week* on the year — a third of what
     they do, on the screen meant to show them how consistent they are. The server now takes `perWeek` from the later of
     the window's start and their first session EVER, and sends that date as `since` only when it is inside the window —
     so a holiday at the start of a window is still a holiday, not a start. */
  const weeks = progress.weeks ?? [];
  const dayShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const perWeek = consistency.perWeek;
  const since = consistency.since ? ` since you started on ${dayShort(consistency.since)}` : '';

  const clauses: string[] = [];
  if (consistency.sessionsDone > 0) {
    clauses.push(`You trained ${consistency.sessionsDone} ${consistency.sessionsDone === 1 ? 'time' : 'times'} — about ${num(perWeek)} a week${since}`);
  }
  if (strength.tracked > 0) {
    clauses.push(
      strength.improved > 0
        ? `${strength.improved} of your ${strength.tracked} ${strength.tracked === 1 ? 'lift is' : 'lifts are'} up`
        : `${strength.tracked} ${strength.tracked === 1 ? 'lift' : 'lifts'} holding steady`,
    );
  }

  /* ── THE WEEK BY WEEK, AND THE LIFTS (22 Nov 2026) ──────────────────────────
     The summary was a sentence and three totals: how much, never how it went over time, nor which lifts moved — the two
     things every logger a client compares this to (Hevy, Strong, Caliber) leads with. `/v1/portal/progress` now carries
     `weeks` and `lifts`, so the screen draws the rhythm as bars (a week with nothing keeps its bar, and no streak is
     counted anywhere) and lists the lifts that went up with what they went from and to. A lift that did not go up is
     counted as *holding steady* and never printed as a negative — the portal's *never shame* rule. */
  const monthShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
  const bars = (pick: (w: { sessions: number; volumeKg: number }) => number): VolumeWeek[] => {
    const peak = Math.max(1, ...weeks.map(pick));
    return weeks.map((w, i) => ({
      /* A date under each bar while they fit (up to 13 weeks); across a year, the month where one starts. */
      label: weeks.length <= 13 ? dayShort(w.start) : i === 0 || monthShort(w.start) !== monthShort(weeks[i - 1].start) ? monthShort(w.start) : '',
      value: pick(w),
      fraction: pick(w) / peak,
      current: i === weeks.length - 1,
      when: `Week of ${dayShort(w.start)}`,
    }));
  };
  const anyVolume = weeks.some((w) => w.volumeKg > 0);
  const lifts = progress.lifts ?? [];
  const up = lifts.filter((l) => l.changePct > 0).slice(0, 5);
  const steady = lifts.filter((l) => l.changePct <= 0).length;
  const point = (p: { loadValue: number | null; e1rm: number | null }) =>
    p.loadValue !== null ? `${num(p.loadValue)} kg` : p.e1rm !== null ? `${num(p.e1rm)} kg` : '—';
  /* ── THE PERCENTAGE IS OF THE FIGURES PRINTED BESIDE IT (22 Nov 2026) ─────
     `changePct` is the estimated one-rep max's move, which is the right ranking key and the wrong caption: printed
     next to *5 kg → 10 kg* it read *99% stronger*, which looks like the product cannot divide. Where two different
     loads are shown, the figure is their move; where the load held and the reps rose (or only an estimate exists),
     the estimate's move is the only honest number and stays. */
  const pctOf = (l: { changePct: number; from: { loadValue: number | null }; to: { loadValue: number | null } }) => {
    const f = l.from.loadValue;
    const t = l.to.loadValue;
    const pct = f !== null && t !== null && f > 0 && f !== t ? ((t - f) / f) * 100 : l.changePct;
    return Math.max(1, Math.round(pct));
  };

  const b = strength.best;
  const sameLoad = b && b.from.loadValue !== null && b.from.loadValue === b.to.loadValue;
  const stronger = b ? `${pctOf(b)}% stronger` : '';

  return (
    <div className="portal col gap4">
      <SubTabs
        label="Time range"
        current={String(progress.windowDays)}
        tabs={windows.map((w) => ({ key: String(w), label: LABEL[w], href: w === 28 ? '/me/progress' : `/me/progress?window=${w}` }))}
      />

      {nothing ? (
        <EmptyState
          title={`Nothing logged in the last ${span}`}
          body={`When you and ${trainerFirstName} log sessions, your lifts and your consistency show up here. There’s no rush.`}
        />
      ) : (
        <>
          <Card>
            <CardHead title={`Your last ${span}`} />
            <CardBody>
              <p className="pprog__lead">{clauses.join('. ')}.</p>
              {b && (
                <div className="pprog__jump">
                  <p className="pprog__k">Biggest jump</p>
                  {sameLoad && b.from.effortValue !== null && b.to.effortValue !== null ? (
                    <Change label={`${b.name} at ${num(b.to.loadValue)} kg`} from={b.from.effortValue} to={b.to.effortValue} unit="reps" delta={stronger} size="lg" />
                  ) : (
                    <Change label={b.name} from={b.from.loadValue ?? b.from.e1rm} to={b.to.loadValue ?? b.to.e1rm ?? 0} unit="kg" delta={stronger} size="lg" />
                  )}
                  <p className="small mt2">
                    <InlineLink href={exerciseHref(b.exerciseId)}>See {b.name} over time</InlineLink>
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {weeks.length > 1 && (
            <Card>
              <CardHead title="Your rhythm">
                <span className="small ink3">sessions a week</span>
              </CardHead>
              <CardBody>
                <VolumeBars
                  size="sm"
                  weeks={bars((w) => w.sessions)}
                  label={`Sessions a week, the last ${span}`}
                  note="A week with nothing in it keeps its bar. There’s no streak to lose here."
                />
              </CardBody>
            </Card>
          )}

          {up.length > 0 && (
            <Card>
              <CardHead title="Your lifts">
                <span className="small ink3">going up</span>
              </CardHead>
              <CardBody flush>
                <ListRows label="Lifts that went up">
                  {up.map((l) => (
                    <ListRow
                      key={l.exerciseId}
                      href={exerciseHref(l.exerciseId)}
                      title={l.name}
                      sub={`${point(l.from)} → ${point(l.to)}`}
                      right={<span className="pprog__up">+{pctOf(l)}%</span>}
                      rightInline
                    />
                  ))}
                </ListRows>
              </CardBody>
              {steady > 0 && (
                <CardBody divided>
                  <p className="small ink2">
                    {steady} {steady === 1 ? 'lift is' : 'lifts are'} holding steady.{' '}
                    <InlineLink href="/me/progress/exercises">See every lift</InlineLink>
                  </p>
                </CardBody>
              )}
            </Card>
          )}

          {anyVolume && weeks.length > 1 && (
            <Card>
              <CardHead title="Weight moved">
                <span className="small ink3">kg a week</span>
              </CardHead>
              <CardBody>
                <VolumeBars
                  weeks={bars((w) => Math.round(w.volumeKg))}
                  unit="kg"
                  label={`Kilograms moved a week, the last ${span}`}
                  format={(n) => n.toLocaleString('en-IN')}
                />
              </CardBody>
            </Card>
          )}

          <Stats up={3} className="pstats">
            <Stat
              label="Sessions"
              value={consistency.sessionsDone}
              detail={`about ${num(perWeek)} a week`}
              href="/me/progress/history"
            />
            <Stat
              label="Lifts up"
              value={strength.tracked > 0 ? `${strength.improved} of ${strength.tracked}` : '—'}
              detail={strength.tracked > 0 ? 'lifts you trained' : 'nothing tracked yet'}
              href="/me/progress/exercises"
            />
            <Stat
              label={`With ${trainerFirstName}`}
              value={consistency.trainerLed}
              detail={`${consistency.selfRun} on your own`}
              href="/me/progress/history"
            />
          </Stats>

          {milestones.length > 0 && (
            <Card>
              <CardHead title="Milestones" />
              <CardBody flush>
                <ListRows label="Milestones">
                  {milestones.map((m) => (
                    <ListRow
                      key={`${m.kind}-${m.at}`}
                      title={m.label}
                      right={
                        <span className="small ink3">
                          {new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone })}
                        </span>
                      }
                      rightInline
                    />
                  ))}
                </ListRows>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
