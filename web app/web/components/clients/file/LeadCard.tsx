'use client';

import { useState, useTransition } from 'react';

import type { ClientDetailWire, PriceListPackWire } from '@/lib/clients/client-api';
import {
  addDaysIso,
  channelLabel,
  closes,
  followUpPhrase,
  followUpState,
  LEAD_CHANNELS,
  LEAD_OUTCOMES,
  LEAD_SOURCES,
  NOTE_MAX,
  outcomeLabel,
  shortDay,
  SOURCE_DETAIL_MAX,
  sourceDetailHint,
  sourceLabel,
  suggestedDays,
  todayIso,
  type LeadChannel,
  type LeadContactWire,
  type LeadOutcome,
  type LeadSource,
} from '@/lib/clients/lead';
import { logLeadContact, saveLead, undoLeadContact } from '@/lib/clients/lead-actions';
import { useToast } from '@/lib/toast/store';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Chip } from '@/web-components/ui/Chip';
import { DateField } from '@/web-components/ui/DateField';
import { TextField } from '@/web-components/ui/Field';
import { KeyValueRow } from '@/web-components/ui/KeyValue';
import { Select } from '@/web-components/ui/Select';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';
import { Timeline } from '@/web-components/ui/Timeline';

import { MessageIcon, PhoneIcon } from './shared';

/**
 * FOLLOWING UP — a prospect's enquiry, on their overview (V48, 23 Nov 2026).
 *
 * Four facts and one verb. Where they came from and what they asked about are what the trainer opens with on the call;
 * the follow-up date is what put them on Today; *Log a response* is the one write, and it moves that date in the same
 * request. The history underneath is what they said each time, newest first, so the next call starts where the last
 * one stopped.
 *
 * ── CALL AND WHATSAPP OPEN THE LOG, AND SEND NOTHING ────────────────────────
 *
 * They are the header's two buttons, labelled here because on a lead they are THE action. Pressing one opens the phone
 * or the chat and, beside it, the composer with that channel already picked — the moment a trainer remembers what was
 * said is the moment they hang up. Neither logs anything by itself and neither is a nudge: no `nudge_log` row, no
 * seven-day quiet period (lib/clients/lead.ts).
 *
 * ── NOT CONSENT-GATED, AND SAID SO ON THE COMPOSER ──────────────────────────
 *
 * The owner's call: this is the enquiry's business record, so it works before the invite is accepted, unlike notes.
 * The composer's hint keeps the note on the enquiry — price, timing, what they want — and off health, which still
 * waits for consent.
 */
export function LeadCard({
  client,
  contacts,
  packs,
  now,
}: {
  client: ClientDetailWire;
  contacts: LeadContactWire[];
  /** The active price list, for "interested in". */
  packs: PriceListPackWire[];
  now: number;
}) {
  const lead = client.lead ?? {};
  const first = client.name.split(' ')[0];
  const phone = dialable(client.phone);
  const follow = followUpState(lead.nextFollowUpOn, now);
  const due = follow.kind === 'today' || follow.kind === 'late';

  const [composing, setComposing] = useState<LeadChannel | null>(null);
  const [editing, setEditing] = useState(false);

  const tag =
    follow.kind === 'late' ? <Tag tone="danger">{follow.days} day{follow.days === 1 ? '' : 's'} late</Tag>
    : follow.kind === 'today' ? <Tag tone="warn">Due today</Tag>
    : follow.kind === 'ahead' ? <Tag>{followUpPhrase(lead.nextFollowUpOn, now)}</Tag>
    : <Tag>No follow-up set</Tag>;

  return (
    /* `Card.Head` by hand: the card is composed from parts, and a composed `Card` draws no `title` of its own. */
    <Card className="cflead">
      <Card.Head className="card__hd--wrap" title={`Following up with ${first}`}>
        {tag}
      </Card.Head>
      {editing ? (
        <LeadEditor client={client} packs={packs} now={now} onDone={() => setEditing(false)} />
      ) : (
        <Card.Body className="cflead__facts">
          <KeyValueRow k="Came from">
            {lead.source ? (
              <>
                {sourceLabel(lead.source)}
                {lead.sourceDetail && <span className="ink3"> · {lead.sourceDetail}</span>}
              </>
            ) : (
              <span className="ink3">Not recorded</span>
            )}
          </KeyValueRow>
          <KeyValueRow k="Interested in">
            {lead.interestedPackName ?? <span className="ink3">Not recorded</span>}
          </KeyValueRow>
          <KeyValueRow k="Next follow-up">
            {lead.nextFollowUpOn ? (
              <span className={follow.kind === 'late' ? 'cfov__late' : undefined}>{shortDay(lead.nextFollowUpOn)}</span>
            ) : (
              <span className="ink3">None</span>
            )}
          </KeyValueRow>
        </Card.Body>
      )}

      {composing ? (
        <Card.Body divided>
          <Composer
            clientId={client.id}
            first={first}
            channel={composing}
            now={now}
            onDone={() => setComposing(null)}
          />
        </Card.Body>
      ) : (
        <Card.Body divided className="cflead__acts">
          {/* Plain anchors, like the header's: `tel:` and `wa.me` are not app routes. The press opens the composer
              beside the call, with the channel picked. */}
          <a
            className="btn btn--secondary btn--sm"
            href={phone ? `tel:+${phone}` : undefined}
            aria-disabled={phone ? undefined : true}
            onClick={() => phone && setComposing('call')}
          >
            <PhoneIcon />
            Call
          </a>
          <a
            className="btn btn--secondary btn--sm"
            href={phone ? `https://wa.me/${phone}` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={phone ? undefined : true}
            onClick={() => phone && setComposing('whatsapp')}
          >
            <MessageIcon />
            WhatsApp
          </a>
          <Button variant={due ? 'primary' : 'secondary'} size="sm" onClick={() => setComposing('call')}>
            Log a response
          </Button>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )}
        </Card.Body>
      )}

      {contacts.length > 0 ? (
        <Card.Body divided>
          <Timeline label={`What ${first} said`}>
            {contacts.map((c) => (
              <Timeline.Item
                key={c.id}
                at={dayLabel(c.createdAt, now)}
                title={
                  <>
                    {outcomeLabel(c.outcome)}
                    <span className="ink3 small"> · {channelLabel(c.channel)}</span>
                  </>
                }
                meta={
                  <>
                    {c.note && <span className="cflead__said">“{c.note}”</span>}
                    {c.followUpOn && <span className="small ink3"> Follow up {shortDay(c.followUpOn)}.</span>}
                  </>
                }
              />
            ))}
          </Timeline>
        </Card.Body>
      ) : (
        <Card.Band>
          <span className="small">
            Nothing logged yet. After a call or a chat, log what {first} said so the next one starts there.
          </span>
        </Card.Band>
      )}
    </Card>
  );
}

/* ── log a response ──────────────────────────────────────────────────────── */

function Composer({
  clientId,
  first,
  channel: initialChannel,
  now,
  onDone,
}: {
  clientId: string;
  first: string;
  channel: LeadChannel;
  now: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const today = todayIso(now);
  /* Minted when the composer opens and kept until the save lands, so a retried Save answers the contact the first
     attempt made rather than writing two. */
  const [id] = useState(() => crypto.randomUUID());
  const [channel, setChannel] = useState<LeadChannel>(initialChannel);
  const [outcome, setOutcome] = useState<LeadOutcome | null>(null);
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  /* Whether the trainer has picked a date themselves; until they do, picking an outcome suggests one. */
  const [nextTouched, setNextTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const closing = closes(outcome);

  const pickOutcome = (o: LeadOutcome) => {
    setOutcome(o);
    setError(null);
    if (!nextTouched) {
      const days = suggestedDays(o);
      setNext(days === null ? '' : addDaysIso(today, days));
    }
  };

  const save = () => {
    if (!outcome) { setError(`Pick what came of it.`); return; }
    if (note.length > NOTE_MAX) { setError(`What they said fits in ${NOTE_MAX} characters.`); return; }
    if (!closing && next && next < today) { setError('Pick today or a later day for the follow-up.'); return; }
    startTransition(async () => {
      const result = await logLeadContact(clientId, {
        id, channel, outcome, note, nextFollowUpOn: closing || !next ? null : next,
      });
      if (!result.ok) { setError(result.message ?? 'It did not save.'); return; }
      onDone();
      const contactId = result.contactId;
      toast.show({
        variant: 'receipt',
        title: closing ? 'Logged · follow-ups ended' : next ? `Logged · follow up ${shortDay(next)}` : 'Logged',
        action: contactId ? { label: 'Undo', onClick: () => void undoLeadContact(clientId, contactId) } : undefined,
      });
    });
  };

  const presets: { label: string; days: number }[] = [
    { label: 'Tomorrow', days: 1 },
    { label: 'In 3 days', days: 3 },
    { label: 'In a week', days: 7 },
    { label: 'In 2 weeks', days: 14 },
  ];

  return (
    <div className="cflead__form">
      <div role="group" aria-label="How you reached them" className="cflead__chips">
        {LEAD_CHANNELS.map((c) => (
          <Chip key={c.id} pressed={channel === c.id} onClick={() => setChannel(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="cflead__sec">
        <p className="micro">What came of it</p>
        <div role="group" aria-label="What came of it" className="cflead__chips">
          {LEAD_OUTCOMES.filter((o) => !o.closes).map((o) => (
            <Chip key={o.id} pressed={outcome === o.id} onClick={() => pickOutcome(o.id)}>
              {o.label}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Not going ahead" className="cflead__chips cflead__closing">
          {LEAD_OUTCOMES.filter((o) => o.closes).map((o) => (
            <Chip key={o.id} pressed={outcome === o.id} onClick={() => pickOutcome(o.id)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </div>

      <Textarea
        label={`What ${first} said`}
        hint="About the enquiry — price, timing, what they want. Not health details."
        limit={NOTE_MAX}
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {closing ? (
        <p className="small ink3">
          This ends the follow-ups. To take {first} off your list, archive them as <i>Not interested</i>.
        </p>
      ) : (
        <div className="cflead__sec">
          <p className="micro">Next follow-up</p>
          <div role="group" aria-label="Next follow-up" className="cflead__chips">
            {presets.map((p) => {
              const on = addDaysIso(today, p.days);
              return (
                <Chip key={p.days} pressed={next === on} onClick={() => { setNext(on); setNextTouched(true); }}>
                  {p.label}
                </Chip>
              );
            })}
            <Chip pressed={next === ''} onClick={() => { setNext(''); setNextTouched(true); }}>
              No follow-up
            </Chip>
          </div>
          <div className="cflead__date">
            <DateField
              label="Or pick a day"
              value={next}
              min={today}
              max={addDaysIso(today, 366)}
              onChange={(v) => { setNext(v); setNextTouched(true); }}
            />
          </div>
        </div>
      )}

      {error && <p className="fld__e" role="alert">{error}</p>}
      <div className="row gap2">
        <Button variant="primary" size="sm" onClick={save} loading={pending}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ── edit where they came from, what they asked about, the date ─────────────── */

function LeadEditor({
  client,
  packs,
  now,
  onDone,
}: {
  client: ClientDetailWire;
  packs: PriceListPackWire[];
  now: number;
  onDone: () => void;
}) {
  const lead = client.lead ?? {};
  const today = todayIso(now);
  const [source, setSource] = useState<LeadSource | null>((lead.source as LeadSource | null | undefined) ?? null);
  const [detail, setDetail] = useState(lead.sourceDetail ?? '');
  const [pack, setPack] = useState(lead.interestedPackId ?? '');
  /* A date already in the past stays as it is unless the trainer changes it: the server refuses a past date. */
  const [next, setNext] = useState(lead.nextFollowUpOn ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const nextChanged = next !== (lead.nextFollowUpOn ?? '');
    if (nextChanged && next && next < today) { setError('Pick today or a later day for the follow-up.'); return; }
    startTransition(async () => {
      const result = await saveLead(client.id, {
        source,
        sourceDetail: detail,
        interestedPackId: pack || null,
        ...(nextChanged ? { nextFollowUpOn: next || null } : {}),
      });
      if (!result.ok) { setError(result.message ?? 'It did not save.'); return; }
      onDone();
    });
  };

  return (
    <Card.Body className="cflead__form">
      <div className="cflead__sec">
        <p className="micro">Where they came from</p>
        <div role="group" aria-label="Where they came from" className="cflead__chips">
          {LEAD_SOURCES.map((s) => (
            <Chip key={s.id} pressed={source === s.id} onClick={() => setSource(source === s.id ? null : s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <TextField
        label="In their words"
        hint={sourceDetailHint(source)}
        maxLength={SOURCE_DETAIL_MAX}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
      />
      <Select
        label="Interested in"
        value={pack}
        onChange={(e) => setPack(e.target.value)}
        options={[
          { value: '', label: packs.length ? 'Not sure yet' : 'No packs on your price list' },
          ...packs.map((p) => ({ value: p.id, label: p.name })),
          /* A pack retired since keeps its place here, so saving does not silently drop it. */
          ...(lead.interestedPackId && !packs.some((p) => p.id === lead.interestedPackId)
            ? [{ value: lead.interestedPackId, label: lead.interestedPackName ?? 'A retired pack' }]
            : []),
        ]}
      />
      {/* DateField's label is for readers only; the visible one is said here, like the composer's. */}
      <div className="cflead__sec">
        <p className="micro" aria-hidden="true">Next follow-up</p>
      <div className="cflead__date">
        <DateField
          label="Next follow-up"
          value={next}
          min={today}
          max={addDaysIso(today, 366)}
          onChange={setNext}
        />
      </div>
      </div>
      {error && <p className="fld__e" role="alert">{error}</p>}
      <div className="row gap2">
        <Button variant="primary" size="sm" onClick={save} loading={pending}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </Card.Body>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** What `wa.me` and `tel:` want: country code, no punctuation — the header's rule. */
function dialable(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** `Today` · `Yesterday` · `Fri 21 Nov`, in the workspace calendar. */
function dayLabel(at: number, now: number): string {
  const day = todayIso(at);
  const today = todayIso(now);
  if (day === today) return 'Today';
  if (day === addDaysIso(today, -1)) return 'Yesterday';
  return shortDay(day);
}
