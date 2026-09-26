import { HeroCard } from '../../../ui/HeroCard';
import { Button } from '../../../ui/Button';
import { Tag } from '../../../ui/Tag';
import { Blk, Bench, Cell } from '../../chrome/Blk';
import { Cmp } from '../../chrome/Cmp';
import { DoDont, SpecTable } from '../../chrome/Docs';
import { byId } from '../../../registry';
import { Calendar, Clock, No, Note, Pin, Play, Rupee, Warn } from '@/components/shell/Icons';

/*
 * The specimens below are `components/today/Hero.tsx`'s own calls, prop for
 * prop. That is not a style choice — the page's whole claim is that the
 * component here and the component in the product are one import, and a
 * specimen assembled from invented props quietly withdraws it. Every card on
 * this page was read back out of `/today`'s DOM before it was written down.
 *
 * WHAT THE 16 SEP 2026 PASS CORRECTED, reported against the running app:
 *
 *  · the In-session specimen was several props behind the product — `unit` read
 *    "min" where the card ships "min elapsed" (the figure is a COUNT, and the
 *    next state draws a CLOCK in the same slot), the chips were one bare
 *    `<Tag>` where the card ships a pinned place plus a linked note, the detail
 *    had no trailing `<i>`, the band was passed `tone: 'acc'` which a live card
 *    flattens, and it showed ONE verb where the card ships two;
 *  · Next up — the state a trainer is looking at for most of the day — had no
 *    specimen at all. The only one on the page was the Do side of a do/don't,
 *    stripped to a figure and a name, so nothing here drew the money band or
 *    the pair of verbs that are the actual reason the state exists;
 *  · `kicker` was documented as an `<h2>` in two places. It renders `<h3>`;
 *  · the closing block recorded `.hro__c2` as missing from the design system.
 *    It is in `webapp.css` §25, and was before this page was written.
 *
 * The component itself did not change, so `updated` in the registry still reads
 * 2026-09-15. A documentation repair is not a rewrite, and bumping the badge
 * for one would tell every reader the specimen above it had moved.
 */

/* The width the card actually has. `/today` lays the hero row out as two
   columns of a 1408px band, so a card measures ~698px on a 1536px window and
   the band sets to two lines. The old specimens stood at 340px, where the same
   sentence breaks to five and the two verbs stack — a drawing of a card at half
   the only width it is ever given. */
const W = 660;
const HALF = 520;

export function HeroCardEntry() {
  const entry = byId('c-herocard')!;

  /* `SessionChips` in the product: the place is the delivery mode and the gym's
     name, and the note chip is a LINK to the file the note is in. */
  const chips = (
    <>
      <Tag>
        <Pin size={12} />
        In Person · Iron Yard, Anna Nagar
      </Tag>
      <Tag href="/clients/c1">
        <Note size={12} />
        Has a note
      </Tag>
    </>
  );

  return (
    <Cmp
      entry={entry}
      status="stable"
      meta={[
        { k: 'Component', v: <code>ui/HeroCard.tsx</code> },
        { k: 'Class', v: <code>.hro</code> },
        { k: 'Ground', v: <><code>.hro</code> live, <code>.hro--quiet</code> otherwise</> },
        { k: 'Figure', v: '44px Archivo, tabular' },
        { k: 'Rewritten', v: '15 Sep 2026' },
      ]}
    >
      <Blk
        title="Specimen · in session"
        lede={
          <>
            A log is open and nobody has closed it. This is the only thing on a screen that is
            HAPPENING, so it is the only one that gets a ground; everything else is a ruled panel
            with no fill. The figure is elapsed rather than remaining &mdash; elapsed is the number a
            trainer checks against the clock on the wall, remaining is the number they are deciding
            with, so remaining goes in the band as a sentence. And it is one size in every state,
            which is the phone&rsquo;s rule and the one of its decisions that survived the move to a
            desk unchanged.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '22px 24px' }}>
          <div style={{ width: W, maxWidth: '100%' }}>
            <HeroCard
              live
              kicker="In session · In Person"
              figure="12"
              /* NOT "min". The next state draws `formatMinute` in this same
                 slot, so `12:00 elapsed` and `17:00` were the same glyphs in
                 the same place meaning opposite things. */
              unit="min elapsed"
              name="Meera Krishnan"
              nameHref="/sessions/s1"
              detail={<>Full B · Week 6/6<i>9:00&ndash;10:00 AM</i></>}
              chips={chips}
              band={{
                icon: <Clock size={16} />,
                text: <><b>18 min left.</b> 6 sets logged · 4,240 kg.</>,
              }}
              actions={
                <>
                  <Button href="/sessions/w1" variant="primary" size="sm">
                    <Play size={15} />
                    Open the log
                  </Button>
                  <Button href="/sessions/w1" variant="ghost" size="sm">
                    End session
                  </Button>
                </>
              }
              label="In session: Meera Krishnan, twelve minutes elapsed, eighteen minutes left"
            />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="Specimen · next up"
        lede={
          <>
            The state the screen is in for most of the day, and the one the card was really designed
            for. The figure already says <i>your next session is at 7:00</i>; what the trainer is
            deciding is whether the hours between now and then are worth anything, so the band prices
            the gap and a secondary verb sells it. The primary verb stays <b>Start session</b> in every
            case &mdash; when <i>Book the 7:00</i> was the only verb, the card answering{' '}
            <i>what must I do next</i> offered to sell an hour instead.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '22px 24px' }}>
          <div style={{ width: W, maxWidth: '100%' }}>
            <HeroCard
              quiet
              lead
              kicker="Next up · starts in 1 h 14 min"
              figure="7:00 AM"
              name="Divya Krishnan"
              nameHref="/sessions/s2"
              detail={<>Full B · Week 6/6<i>45 min</i></>}
              chips={chips}
              band={{
                icon: <Rupee size={16} />,
                text: (
                  <>
                    <b>7:00-9:00 AM is free</b> inside your own hours: 2 h, &#8377;1,500 billed,
                    &#8377;1,050 yours.
                  </>
                ),
              }}
              actions={
                <>
                  <Button href="/sessions/new?session=s2" variant="primary" size="sm">
                    <Play size={15} />
                    Start session
                  </Button>
                  <Button href="/schedule?book=420" variant="secondary" size="sm">
                    Book the 7:00 AM
                  </Button>
                </>
              }
              label="Next: Divya Krishnan at seven, forty-five minutes"
            />
          </div>
        </Bench>
      </Blk>

      <Blk
        title="The states, and what each one is allowed to say"
        lede={
          <>
            <code>live</code> is a claim about the world &mdash; <b>a log is open right now</b> &mdash; and
            it is what earns the ground. Everything below it is <code>.hro--quiet</code>, and they are
            told apart by their verbs rather than by a second tint. The trailing card gets no{' '}
            <b>Start</b> at all: starting the 17:00 at 09:40 is not a thing a trainer means to do, and
            three Start buttons down a row make the one that is live indistinguishable from the two
            that are premature.
          </>
        }
      >
        <Bench pad={false} style={{ padding: '22px 24px', gap: 20, alignItems: 'flex-start' }}>
          <Cell label="LIVE · GROUND, TWO VERBS">
            <div style={{ width: HALF, maxWidth: '100%' }}>
              <HeroCard
                live
                kicker="In session · Online"
                figure="12"
                unit="min elapsed"
                name="Meera Krishnan"
                detail={<>Check-in · Online<i>9:00&ndash;9:30 AM</i></>}
                band={{
                  icon: <Clock size={16} />,
                  text: (
                    <>
                      <b>18 min left.</b> A remote check-in is the one kind of session run from this
                      desk.
                    </>
                  ),
                }}
                actions={
                  <>
                    <Button variant="primary" size="sm">
                      <Play size={15} />
                      Open the log
                    </Button>
                    <Button variant="ghost" size="sm">End session</Button>
                  </>
                }
                label="In session with Meera Krishnan, twelve minutes elapsed"
              />
            </div>
          </Cell>

          <Cell label="LATE · WARN BAND, AND STILL NOT LIVE">
            <div style={{ width: HALF, maxWidth: '100%' }}>
              <HeroCard
                lead
                kicker="Next up · 8 min ago"
                figure="7:00 AM"
                name="Divya Krishnan"
                detail={<>Full B · Week 6/6<i>45 min</i></>}
                band={{
                  icon: <Warn size={16} />,
                  tone: 'warn',
                  text: (
                    <>
                      <b>Nothing logged.</b> A session stays &ldquo;next&rdquo; for 90 min, so this
                      card holds until 8:30 AM.
                    </>
                  ),
                }}
                actions={
                  <>
                    <Button variant="primary" size="sm">
                      <Play size={15} />
                      Start session
                    </Button>
                    <Button variant="ghost" size="sm">
                      <No size={15} />
                      Mark no-show
                    </Button>
                  </>
                }
                label="Next: Divya Krishnan at seven, nothing logged"
              />
            </div>
          </Cell>

          <Cell label="AFTER THAT · NO START">
            <div style={{ width: HALF, maxWidth: '100%' }}>
              <HeroCard
                quiet
                kicker="After that · starts in 5 h 33 min"
                figure="6:00 PM"
                name="Aarav Sharma"
                detail={<>Lower A · Week 8/8<i>1 h</i></>}
                actions={
                  <>
                    <Button variant="ghost" size="sm">
                      <Calendar size={15} />
                      Move Aarav
                    </Button>
                    <Button variant="ghost" size="sm">Confirm</Button>
                  </>
                }
                label="Later: Aarav Sharma at six"
              />
            </div>
          </Cell>

          <Cell label="TOMORROW · A FIGURE AND ONE VERB">
            <div style={{ width: HALF, maxWidth: '100%' }}>
              <HeroCard
                quiet
                kicker="Tomorrow · Wednesday"
                figure="6:30 AM"
                name="Rohan Iyer"
                detail={<>Upper A · Week 2/6<i>1 h</i></>}
                band={{
                  icon: <Clock size={16} />,
                  text: <><b>4 sessions tomorrow</b>, the first 90 min after your day opens.</>,
                }}
                actions={
                  <Button variant="secondary" size="sm">
                    <Calendar size={15} />
                    The week
                  </Button>
                }
                label="Tomorrow, Wednesday, first session at six thirty"
              />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="live is the claim; lead is the one that went"
        lede={
          <>
            <code>lead</code> meant <b>start reading here</b> and was a second, weaker wash on top of{' '}
            <code>live</code>&rsquo;s; the 15 Sep 2026 rewrite dropped it, because ranking two cards by
            fill says the same thing once instead of twice. The prop is still accepted so that none of
            the eight call-sites in <code>Hero.tsx</code> had to change, and nothing reads it &mdash;
            which is why the first two cards below are identical.
          </>
        }
      >
        <Bench style={{ gap: 18, alignItems: 'flex-start' }}>
          <Cell label="LEAD">
            <div style={{ width: 230 }}>
              <HeroCard kicker="Next up" lead figure="9:00 AM" name="Divya K" label="Next session, nine o'clock" />
            </div>
          </Cell>
          <Cell label="NEITHER">
            <div style={{ width: 230 }}>
              <HeroCard kicker="Later" figure="4:00 PM" name="Rohan S" label="Later session, four o'clock" />
            </div>
          </Cell>
          <Cell label="LIVE — THE ONE THAT SHOWS">
            <div style={{ width: 230 }}>
              <HeroCard kicker="In session" live figure="12" unit="min elapsed" name="Meera K" label="In session, twelve minutes" />
            </div>
          </Cell>
        </Bench>
      </Blk>

      <Blk
        title="Why it is a component"
        lede={
          <>
            It was declared <b>inside</b> <code>components/today/Hero.tsx</code> and used eight times. A pattern
            that answers a general question &mdash; <i>the next thing, as a number a trainer can read across a
            room</i> &mdash; and lives at one call-site is a pattern the next screen solves again, differently.
            Nothing about it changed on the way into the catalogue except the name, from <code>Card</code> to{' '}
            <code>HeroCard</code>.
          </>
        }
      >
        <DoDont
          yes={{
            figure: (
              <div style={{ maxWidth: 250 }}>
                <HeroCard
                  quiet
                  kicker="Next up · in 1 h"
                  figure="7:00 AM"
                  name="Divya Krishnan"
                  detail={<>Full B · Week 6/6<i>45 min</i></>}
                  band={{ icon: <Rupee size={16} />, text: <><b>7:00-9:00 AM is free.</b></> }}
                  actions={
                    <Button variant="primary" size="sm">
                      <Play size={15} />
                      Start session
                    </Button>
                  }
                  label="Next session, seven o'clock, Divya Krishnan"
                />
              </div>
            ),
            caption: (
              <>
                A figure the eye lands on first, one or two verbs, and a band that turns the figure into a
                decision.
              </>
            ),
          }}
          no={{
            figure: (
              <div style={{ maxWidth: 250 }}>
                <div className="card">
                  <div className="card__hd">
                    <span className="card__t">Team details</span>
                  </div>
                  <div className="card__b">
                    <p className="small">A region with a heading is a Card, not this.</p>
                  </div>
                </div>
              </div>
            ),
            caption: (
              <>
                A bounded region with a heading is <code>ui/Card.tsx</code>. This has no head and no body
                &mdash; wrapping it in one would add <code>.card__b</code>&rsquo;s padding to a stack that
                already sets its own.
              </>
            ),
          }}
        />
      </Blk>

      <Blk
        title="The figure is aria-hidden, and label is not optional"
        lede={
          <>
            A screen reader handed <code>12:00</code> reads &ldquo;twelve colon zero zero&rdquo;, and{' '}
            <code>12</code> reads &ldquo;twelve&rdquo; &mdash; twelve of what? So the figure is hidden and{' '}
            <code>label</code> is the card&rsquo;s actual name, required in the type and carried on the{' '}
            <code>role=&quot;group&quot;</code>. The kicker is a real heading &mdash; an{' '}
            <code>&lt;h3&gt;</code>, under the page&rsquo;s <code>&lt;h2&gt;</code> &mdash; and before it was,
            this screen&rsquo;s heading outline was empty and the only way through six modules was to walk
            every element.
          </>
        }
      >
        <SpecTable
          rows={[
            { property: 'label', token: 'string', value: 'required', note: 'The whole card as one sentence, including what the figure means. Lands on role="group".' },
            { property: 'kicker', token: 'ReactNode', value: 'required', note: 'Renders as the h3 — the card’s heading in the page outline. The only element whose tone changes between states.' },
            { property: 'live', token: 'boolean', value: 'false', note: 'A log is open RIGHT NOW. The only thing that earns the accent ground, and it adds the pulsing dot before the kicker. A late session is deliberately not live.' },
            { property: 'quiet', token: 'boolean', value: 'false', note: 'Forces the ruled panel. Redundant unless live is also set — !live already draws quiet — and passed by the Next up card as a statement of intent.' },
            { property: 'lead', token: 'boolean', value: 'false', note: 'Accepted and not read. Kept so the eight call-sites did not change when the 15 Sep rewrite made fill the only rank.' },
            { property: 'figure', token: 'ReactNode', value: '—', note: 'aria-hidden. 44px Archivo, tabular so a ticking clock does not make the card twitch. The same size in every state.' },
            { property: 'unit', token: 'string', value: '—', note: 'The em beside the figure. “min elapsed” on the live card, never “min”: the next state draws a clock in the same slot.' },
            { property: 'name', token: 'ReactNode', value: '—', note: 'The client. 15.5px, ink.' },
            { property: 'nameHref', token: 'string', value: '—', note: 'Makes the name a link, inheriting colour. Deliberately not a third verb in actions.' },
            { property: 'detail', token: 'ReactNode', value: '—', note: 'The programme line. A trailing <i> is set upright and pushed 12px right — that is where the duration or the time range goes.' },
            { property: 'chips', token: 'ReactNode', value: '—', note: 'The .hro__c2 row. On /today: the delivery mode with the gym’s name, and a linked “Has a note” — a chip that says a note exists and cannot open it has told the trainer about a thing and then asked them to go and find it.' },
            { property: 'band', token: 'HeroCardBand', value: '—', note: 'icon + text, tone acc or warn. Turns a fact into a decision, and is the point of the card. Inside a LIVE card any tone is flattened to a plain surface: an accent plate on an accent ground is not a second signal.' },
            { property: 'actions', token: 'ReactNode', value: '—', note: 'One or two sm Buttons, never three. The live and late cards pair a primary with a ghost; the trailing card gets no primary at all.' },
          ]}
        />
      </Blk>

      <Blk
        title="Every class in this component is in the design system"
        tag="no gap"
        lede={
          <>
            <code>.hro</code>, <code>.hro--quiet</code>, <code>.hro__k</code>, <code>.hro__c</code>,{' '}
            <code>.hro__u</code>, <code>.hro__n</code>, <code>.hro__d</code>, <code>.hro__c2</code>,{' '}
            <code>.hro__w</code> and <code>.hro__a</code> are all in <code>webapp.css</code> §25, which is
            synced from <code>design-system/webapp/webapp/assets/webapp.css</code> &mdash; so a designer can
            reach all ten in the design file, and <code>app/styles/app.css</code> defines none of them. This
            page previously recorded <code>.hro__c2</code> as a gap; §25 had already closed it, and app.css
            keeps only the note saying where the two moved.
          </>
        }
      />

      <Blk
        title="One drawing of this card is still out of date, and it is not this page"
        tag="gap"
        lede={
          <>
            The static design set draws the hero in exactly one place &mdash;{' '}
            <code>webapp-dashboard.html</code> &mdash; and it is the pre-rewrite markup: a{' '}
            <code>.card.card--acc</code> wrapper around the <code>.hro</code>, a{' '}
            <code>&lt;span class=&quot;hro__k hro__k--live&quot;&gt;</code> where the component renders an{' '}
            <code>&lt;h3&gt;</code>, and no <code>.hro--quiet</code>, no chip row and no second verb. The
            stylesheet under it is current; the markup above it is several passes behind. Recorded rather
            than quietly rewritten, because that file is the designer&rsquo;s.
          </>
        }
      />
    </Cmp>
  );
}
