'use client';

import { GymPicker } from '@/components/profile/GymPicker';
import type { PlaceHit } from '@/lib/places/types';
import { useState, useTransition } from 'react';

import { PackCard } from './PackCard';
import { PackPanel, type PackPreset } from './PackPanel';
import { addPack, deletePack, saveGym, savePack, setPackStatus, swapPackOrder } from '@/lib/packs/actions';
import { buildPacks, type PackRow, type PacksData } from '@/lib/packs/compute';
import type { PackWrite } from '@/lib/packs/api';
import { PRESETS, SERVICES } from '@/lib/packs/vocab';
import { rupees } from '@/lib/today/time';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { Avatar } from '@/web-components/ui/Avatar';
import { Table, Row } from '@/web-components/ui/Table';
import { EmptyState } from '@/web-components/ui/EmptyState';
import { Segment as SegmentGroup, SegmentButton } from '@/web-components/ui/Segment';

/**
 * **The price list** — the phone's § 06 · 4b, on a desk, and since the
 * five-destination pass a TAB inside Business rather than a route of its own.
 *
 * ─── IT USED TO HAVE A RIVAL, AND THE RIVAL IS GONE ────────────────────────
 *
 * This docstring opened by distinguishing itself from "the Money book's Packages
 * tab, which groups *sold* rows into price points it guesses at and heads a gym
 * card that says the prices aren't on file yet". Two screens called *Packages*,
 * one reading the `pack` table and one inferring it — and the rail drew them in
 * different groups so nobody had to notice.
 *
 * Folding both into Business put them side by side, where a duplicate cannot
 * hide. `components/money/PackagesTab.tsx` is deleted and this is the Packages
 * tab: it reads the `pack` table, which is where the prices actually are.
 * Nothing that tab showed is lost — what a given client BOUGHT was always the
 * better answer of the two, and it lives on their file's Payments tab, against
 * their name, next to what they still owe.
 *
 * ─── THE RULE THIS SCREEN EXISTS FOR ───────────────────────────────────────
 *
 * **An independent trainer has one list. A trainer who does both has two.**
 * They are separated rather than mixed because only one of them is theirs to
 * change — a gym's counter prices are a price the trainer can neither set nor
 * discount, and their cut of one is the gym share, not a margin. Adding a client
 * asks which of the two applies before it asks anything else, so the two lists
 * have to be two lists all the way down.
 *
 * **Since 25 Nov 2026 the two lists are two VIEWS, picked at the top** —
 * *Your packs* and the gym's, each with its count. In one scroll the gym's list
 * was a fifth heading under four service headings of the trainer's own, below
 * the fold, with the gym's name set in a sidebar card. Now the service names are
 * sub-headings inside *Your packs*, the gym's name is set and changed on the
 * gym's own view, and the one *New pack* adds to the list on screen (the panel
 * still asks *who sells it*, pre-answered).
 *
 * The gym is a **defaults hint, never a gate** — who actually collects is still
 * decided per client at add-client time, because the mix changes month to month.
 * Switching to *On my own* hides the gym group but never deletes a price on it,
 * which is why `buildPacks` keeps drawing a trainer's own list even under *At a
 * gym* when they have one.
 *
 * ─── WHAT ELSE IS HERE, AND WHY ────────────────────────────────────────────
 *
 * **The pricing callout** does the arithmetic nobody does: a shorter pack should
 * cost MORE per session than a longer one, and it says whether this list gets it
 * right. Only the trainer's own prices are judged — telling somebody their gym
 * has priced badly is advice they cannot act on.
 *
 * **Ending soon** is here rather than on the roster because renewing is a money
 * decision, and this is where the prices are.
 *
 * **Retiring never touches a sale.** It is a status, so everyone already on a
 * pack keeps exactly what they bought — it simply stops being offered. The
 * confirmation says that in those words, because the button otherwise reads like
 * a delete.
 */
export function Packages({ data, startOnGym = false }: { data: PacksData; startOnGym?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // How you work. Held locally so the gym field can disagree with the server for
  // as long as it takes to fill in a name.
  const [gymDraft, setGymDraft] = useState(data.trainer.gymName ?? '');
  const [gymPlaceDraft, setGymPlaceDraft] = useState<PlaceHit | null | undefined>(undefined);

  /** The open panel: who it starts as, the row it edits, or a preset it starts from. */
  const [editing, setEditing] = useState<{ owner: 'trainer' | 'gym'; pack: PackRow | null; preset: PackPreset | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  const view = buildPacks({
    packs: data.packs,
    live: data.live,
    clientNames: data.clientNames,
    gymName: data.trainer.gymName,
  });

  /** The gym is only real once it has a name — an unnamed list belongs to nobody. */
  const gym = data.trainer.gymName;

  /* WHICH LIST IS OPEN — the trainer's own, or the gym's. Two lists with two
     owners, so they are two views picked at the top rather than one scroll in
     which the gym's prices were a fifth heading under four service headings of
     the trainer's own (25 Nov 2026). State, not the URL: both lists are already
     in the payload, so switching fetches nothing (trap 25). Opens on the gym's
     only when the trainer sells nothing of their own and the gym's has rows. */
  const [list, setList] = useState<'mine' | 'gym'>(
    () => (startOnGym || (view.selling.length === 0 && view.gymSelling.length > 0) ? 'gym' : 'mine'),
  );
  /* The gym's name is edited on the gym's list, where it is the heading. */
  const [gymOpen, setGymOpen] = useState(false);

  /* A refusal that names a next move keeps its code, so the message can offer it. */
  const [refusedCode, setRefusedCode] = useState<string | null>(null);
  /* Packs the server said were sold after all (`PACK_SOLD`): Delete is withdrawn. */
  const [soldIds, setSoldIds] = useState<Set<string>>(new Set());

  function run(work: () => Promise<{ ok: boolean; message?: string; code?: string }>, done: string) {
    setNotice(null);
    setError(null);
    setRefusedCode(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) setNotice(done);
      else {
        setError(result.message ?? 'That did not go through. Nothing changed.');
        setRefusedCode(result.code ?? null);
      }
    });
  }

  /* Minted when the panel OPENS, not when it is submitted: a double click or a
     retried request then replays the same create (200) instead of adding two. */
  const [newId, setNewId] = useState('');
  /* A refusal is drawn inside the panel, beside the answers it is about, and the
     panel stays open so a taken name is fixed rather than retyped. */
  const [formError, setFormError] = useState<string | null>(null);

  function submit(fields: PackWrite, owner: 'trainer' | 'gym') {
    const target = editing;
    if (!target) return;
    setFormError(null);
    startTransition(async () => {
      const result = target.pack
        ? await savePack(target.pack.id, fields)
        : await addPack({ ...fields, id: newId, owner, orderIndex: data.packs.length });
      if (!result.ok) {
        setFormError(result.message ?? 'That did not go through. Nothing changed.');
        setRefusedCode(result.code ?? null);
        return;
      }
      setEditing(null);
      if (!target.pack) setList(owner === 'gym' ? 'gym' : 'mine');
      trigger?.focus();
      setNotice(
        target.pack
          ? 'Saved. Packs already sold are untouched.'
          : owner === 'gym'
            ? `${fields.name} added to ${gym ?? 'the gym'}'s list.`
            : `${fields.name} added to your price list.`,
      );
    });
  }

  /* State, not a ref: `open` is handed to cards that render in this pass, and
     `react-hooks/refs` cannot tell a handler from a read. */
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  function open(owner: 'trainer' | 'gym', pack: PackRow | null, preset: PackPreset | null = null) {
    /* Remembered so closing can put focus back on the control that opened it. */
    setTrigger(document.activeElement as HTMLElement | null);
    setNotice(null);
    setError(null);
    setConfirming(null);
    setFormError(null);
    if (!pack) setNewId(crypto.randomUUID());
    setEditing({ owner, pack, preset });
  }

  function close() {
    setEditing(null);
    trigger?.focus();
  }

  /** The cards of one price list, each one a pack, with every write it can make. */
  function cards(rows: PackRow[]) {
    return (
      <ul className="pkx-grid" role="list">
        {rows.map((row, i) => {
          const above = i > 0 ? rows[i - 1].source : null;
          const below = i < rows.length - 1 ? rows[i + 1].source : null;
          return (
            <li key={row.id}>
              <PackCard
                row={row}
                first={above === null}
                last={below === null}
                confirming={confirming === row.id}
                sold={soldIds.has(row.id)}
                pending={pending}
                gym={gym}
                onEdit={() => open(row.owner, row)}
                onMove={(dir) => {
                  const other = dir < 0 ? above : below;
                  if (!other) return;
                  run(
                    () => swapPackOrder(
                      { id: row.id, orderIndex: row.orderIndex },
                      { id: other.id, orderIndex: other.orderIndex },
                    ),
                    `${row.name} moved ${dir < 0 ? 'earlier' : 'later'}.`,
                  );
                }}
                onAskRemove={() => setConfirming(row.id)}
                onCancelRemove={() => setConfirming(null)}
                onRetire={() => {
                  setConfirming(null);
                  run(() => setPackStatus(row.id, 'inactive'), `${row.name} retired.`);
                }}
                onDelete={() => {
                  setError(null);
                  setNotice(null);
                  startTransition(async () => {
                    const result = await deletePack(row.id);
                    if (result.ok) {
                      setConfirming(null);
                      setNotice(`${row.name} deleted.`);
                    } else if (result.code === 'PACK_SOLD') {
                      setSoldIds((ids) => new Set(ids).add(row.id));
                      setError(result.message ?? null);
                      setRefusedCode('PACK_SOLD');
                    } else {
                      setConfirming(null);
                      setError(result.message ?? 'That did not go through. Nothing changed.');
                    }
                  });
                }}
              />
            </li>
          );
        })}
      </ul>
    );
  }

  const mine = list === 'mine';
  const retired = view.retired.filter((r) => r.owner === (mine ? 'trainer' : 'gym'));
  const gymTitle = gym ?? 'At a gym';
  /* The one way in adds to the list on screen. The panel still asks *who sells
     it* first, pre-answered, so the owner is an answer the trainer can see and
     change — never a side effect of which button they happened to press. */
  const addHere = () => open(mine || !gym ? 'trainer' : 'gym', null);
  const canAdd = mine || gym !== null;

  /** The gym's name, set or changed in place. Shared by the no-gym prompt and *Change gym*. */
  const gymForm = (
    <div className="pkx-gymf">
      <GymPicker
        id="pk-gym"
        label="Which gym"
        name={gymDraft}
        place={gymPlaceDraft ?? null}
        maxLength={80}
        onChange={(next) => {
          setGymDraft(next.name);
          setGymPlaceDraft(next.place as PlaceHit | null);
        }}
      />
      <p className="pkx-hint">Whatever it is called on the board outside. We count how many trainers work at each gym — never who they coach.</p>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <Button
          variant="primary"
          size="sm"
          disabled={pending || gymDraft.trim() === (data.trainer.gymName ?? '')}
          onClick={() =>
            run(
              () => saveGym(gymDraft, gymPlaceDraft, data.trainer.trainingModes),
              gymDraft.trim() === ''
                ? 'Saved. No gym on your profile now.'
                : `Saved. ${gymDraft.trim()}'s price list is open.`,
            )
          }
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {gym && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setGymDraft(data.trainer.gymName ?? '');
              setGymPlaceDraft(undefined);
              setGymOpen(false);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="pkx__tools">
        <SegmentGroup label="Which price list" mode="single">
          <SegmentButton mode="single" pressed={mine} count={view.selling.length} onClick={() => { setList('mine'); setConfirming(null); }}>
            Your packs
          </SegmentButton>
          <SegmentButton mode="single" pressed={!mine} count={gym || view.gymSelling.length ? view.gymSelling.length : undefined} onClick={() => { setList('gym'); setConfirming(null); }}>
            {gymTitle}
          </SegmentButton>
        </SegmentGroup>
        {canAdd && (
          <Button variant="primary" className="pkx__new" onClick={addHere}>
            {mine ? 'New pack' : 'New gym pack'}
          </Button>
        )}
      </div>

      {(notice || error) && (
        <p className={error ? 'msg msg--err' : 'msg msg--ok'} style={{ marginBottom: 14 }} role="status">
          <span>
            {error ?? notice}
            {error && refusedCode === 'GYM_PACK_NEEDS_GYM' && (
              <> Name your gym on its tab on this page, or on the <a href="/settings/profile/work">Work &amp; hours</a> tab.</>
            )}
          </span>
        </p>
      )}

      <div className="pkx">
        <div className="pkx__main">
          {mine ? (
            <>
              <p className="pkx-lead">Your own prices, paid to you.</p>
              {view.selling.length === 0 ? (
                <Card>
                  <Card.Body>
                    <EmptyState
                      kind="first-run"
                      title="No packs of your own yet"
                      body="Add what you charge. Adding a client offers exactly these."
                      action={
                        <div className="pkx-presets" role="group" aria-label="Start from">
                          {PRESETS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="pkx-preset"
                              onClick={() => open('trainer', null, p.terms)}
                            >
                              <b>{p.title}</b>
                              <span>{p.note}</span>
                            </button>
                          ))}
                        </div>
                      }
                    />
                  </Card.Body>
                </Card>
              ) : (
                SERVICES.map((s) => {
                  const rows = view.selling.filter((r) => r.service === s.id);
                  if (rows.length === 0) return null;
                  return (
                    <section className="pkx-g" key={s.id} aria-label={s.label}>
                      <h3 className="pkx-g__t">{s.label} <span className="pkx-g__c">{rows.length}</span></h3>
                      <p className="pkx-g__n">{s.note}</p>
                      {cards(rows)}
                    </section>
                  );
                })
              )}
            </>
          ) : (
            <>
              {gym && !gymOpen ? (
                <div className="pkx-gymhd">
                  <p className="pkx-lead">
                    <b>{gym}</b>’s counter prices. The gym collects; you state only your share.
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setGymOpen(true)}>Change gym</Button>
                </div>
              ) : (
                <Card className="pkx-gymcard">
                  <Card.Body>
                    <h3 className="pkx-gymcard__t">{gym ? 'Change your gym' : 'Do you also coach at a gym?'}</h3>
                    {!gym && (
                      <p className="small" style={{ color: 'var(--tx-ink-3)', margin: '2px 0 12px' }}>
                        Name it and add what its counter charges. When a client pays the gym, you pick its pack and your share is worked out.
                      </p>
                    )}
                    {gymForm}
                  </Card.Body>
                </Card>
              )}

              {gym && (view.gymSelling.length === 0 ? (
                <div className="pkx-g__e">
                  Nothing from {gym} yet. Add what their counter charges, and you can pick it when a client pays the gym instead of you.
                  <span><Button variant="secondary" size="sm" onClick={addHere}>Add a gym pack</Button></span>
                </div>
              ) : (
                cards(view.gymSelling)
              ))}

              {/* Gym packs on file with no gym named: still the trainer's to see and fix. */}
              {!gym && view.gymSelling.length > 0 && (
                <section className="pkx-g mt4" aria-label="Gym packs">
                  <p className="pkx-g__n">Already on file from a gym. Name the gym above to add more.</p>
                  {cards(view.gymSelling)}
                </section>
              )}
            </>
          )}

          {retired.length > 0 && (
            <section className="pkx-g pkx-ret">
              <button
                type="button"
                className="pkx-ret__t"
                aria-expanded={showRetired}
                onClick={() => setShowRetired(!showRetired)}
              >
                Retired <span className="pkx-g__c">{retired.length}</span>
                <span className="pkx-ret__c" aria-hidden="true">{showRetired ? '–' : '+'}</span>
              </button>
              {showRetired && (
                <Card flush className="mt4">
                  <div className="tblwrap">
                    <Table caption="Retired packs, no longer on sale">
                      {retired.map((row) => (
                        <Row
                          key={row.id}
                          style={{ color: 'var(--tx-ink-3)' }}
                          cells={[
                            { key: 'pack', content: <b style={{ color: 'var(--tx-ink-2)' }}>{row.name}</b> },
                            { key: 'price', content: rupees(row.amount), numeric: true },
                            {
                              key: 'note',
                              className: 'small',
                              content: row.clients > 0
                                ? `${row.clients} still on it — no longer offered`
                                : 'No longer offered',
                            },
                            {
                              key: 'act',
                              style: { textAlign: 'right' },
                              content: (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={pending}
                                  onClick={() => run(() => setPackStatus(row.id, 'active'), `${row.name} is back on the list.`)}
                                >
                                  Bring back
                                </Button>
                              ),
                            },
                          ]}
                        />
                      ))}
                    </Table>
                  </div>
                </Card>
              )}
            </section>
          )}
        </div>

        {/* ── the gym, the check, and who is running out ─────────────── */}
        <aside className="pkx__side">
          {view.ending.length > 0 && (
            <Card title="Ending soon" aside={<><Tag tone="warn">{view.ending.length}</Tag></>}>
              <p className="small" style={{ color: 'var(--tx-ink-3)', marginBottom: 10 }}>
                Renewing is a money decision, so it sits with the prices.
              </p>
              {view.ending.map((row) => (
                <div className="pk__end" key={row.packageId}>
                  <span className="who" style={{ alignItems: 'flex-start', minWidth: 0 }}>
                    <Avatar name={row.name} id={row.clientId} size="sm" />
                    <span style={{ minWidth: 0 }}>
                      <b>{row.name}</b>
                      <span className="small" style={{ display: 'block', color: 'var(--tx-ink-3)' }}>
                        {row.detail}
                      </span>
                    </span>
                  </span>
                  {/* `renewal`, so the message names the sessions left rather than
                      asking for money — a pack running out is a renewal
                      conversation, and a payment reminder would read as chasing
                      somebody who owes nothing. */}
                  <span className="pk__endacts">
                    <NudgeButton
                      clientId={row.clientId}
                      clientName={row.name}
                      template="renewal"
                      className="btn btn--sm btn--secondary"
                      showContactedNote={false}
                    />
                    <Button href={`/clients/${row.clientId}/package`} variant="ghost" size="sm">
                      Renew
                    </Button>
                  </span>
                </div>
              ))}
            </Card>
          )}

          {mine && view.priceNote && (
            <Card title="The per-session check" tone="acc" className={view.ending.length > 0 ? 'mt4' : undefined}>
              <p className="small" style={{ lineHeight: 1.6 }}>{view.priceNote}</p>
            </Card>
          )}

        </aside>
      </div>

      {/* The phone's way in, pinned: the list is a scroller and a button at its
          top is gone after the first swipe. Hidden at a desk, where the toolbar
          button is in reach. */}
      <div className="pkx__bar">
        {canAdd && <Button variant="primary" onClick={addHere}>{mine ? 'New pack' : 'New gym pack'}</Button>}
      </div>

      {editing && (
        <PackPanel
          key={editing.pack?.id ?? 'new'}
          gymName={gym}
          startOwner={editing.owner}
          seed={editing.pack ? editing.pack.source : null}
          preset={editing.preset}
          pending={pending}
          error={formError}
          onSubmit={submit}
          onClose={close}
        />
      )}
    </>
  );
}
