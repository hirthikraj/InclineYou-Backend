'use client';

import { GymPicker } from '@/components/profile/GymPicker';
import type { PlaceHit } from '@/lib/places/types';
import { useEffect, useRef, useState, useTransition } from 'react';

import { PackForm } from './PackForm';
import { addPack, deletePack, saveGym, savePack, setPackStatus, swapPackOrder } from '@/lib/packs/actions';
import { buildPacks, type PackRow, type PacksData } from '@/lib/packs/compute';
import type { PackWrite } from '@/lib/packs/api';
import { serviceLabel } from '@/lib/packs/vocab';
import { rupees } from '@/lib/today/time';
import { NudgeButton } from '@/components/nudge/NudgeButton';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Tag } from '@/web-components/ui/Tag';
import { Avatar } from '@/web-components/ui/Avatar';
import { Table, Row } from '@/web-components/ui/Table';

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
 * *How you work* is therefore the first thing on the page and not a setting
 * buried elsewhere: it is the answer the rest of the screen is a consequence of.
 * It is a **defaults hint, never a gate** — who actually collects is still
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
export function Packages({ data }: { data: PacksData }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // How you work. Held locally so the two controls can disagree with the server
  // for as long as it takes to fill in a gym name — `saveWorkMode` refuses a
  // nameless one, and a select that snapped back on every keystroke would make
  // that impossible to satisfy.
  const [gymDraft, setGymDraft] = useState(data.trainer.gymName ?? '');
  const [gymPlaceDraft, setGymPlaceDraft] = useState<PlaceHit | null | undefined>(undefined);

  /** The open form: which list it writes to, and the row it is editing, if any. */
  const [editing, setEditing] = useState<{ owner: 'trainer' | 'gym'; pack: PackRow | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const view = buildPacks({
    packs: data.packs,
    live: data.live,
    clientNames: data.clientNames,
    gymName: data.trainer.gymName,
  });

  /** The gym is only real once it has a name — an unnamed list belongs to nobody. */
  const gym = data.trainer.gymName;
  const gymNeedsName = view.showsGym && gym === null;

  /* A refusal that names a next move keeps its code, so the row can offer it —
     `PACK_SOLD` on a delete turns into *Retire it instead*. */
  const [refusedCode, setRefusedCode] = useState<string | null>(null);
  /* Packs the server said were sold after all (`PACK_SOLD`): the count on the row
     was stale, so Delete is withdrawn for them and Retire is the offer. */
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

  /* Minted when the form OPENS and not when it is submitted: a double click or a
     retried request then replays the same create (the server answers 200 with
     the pack it already made) instead of adding a second. */
  const newId = useRef<string>('');
  /* A refusal is drawn inside the form while it is open — beside the field it is
     about — and the form stays open, so a taken name is fixed rather than retyped. */
  const [formError, setFormError] = useState<string | null>(null);

  function submit(fields: PackWrite) {
    const target = editing;
    if (!target) return;
    setFormError(null);
    startTransition(async () => {
      const result = target.pack
        ? await savePack(target.pack.id, fields)
        : await addPack({ ...fields, id: newId.current, owner: target.owner, orderIndex: data.packs.length });
      if (!result.ok) {
        setFormError(result.message ?? 'That did not go through. Nothing changed.');
        setRefusedCode(result.code ?? null);
        return;
      }
      setEditing(null);
      setNotice(
        target.pack
          ? 'Saved. Packs already sold are untouched.'
          : target.owner === 'gym'
            ? `${fields.name} added to ${gym ?? 'the gym'}'s list.`
            : `${fields.name} added to your price list.`,
      );
    });
  }

  const sheet = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  function open(owner: 'trainer' | 'gym', pack: PackRow | null) {
    /* Remembered so closing can put focus back on the control that opened it —
       the rule every menu and sheet in this shell already follows. */
    trigger.current = document.activeElement as HTMLElement | null;
    setNotice(null);
    setError(null);
    setConfirming(null);
    setFormError(null);
    if (!pack) newId.current = crypto.randomUUID();
    setEditing({ owner, pack });
  }

  function close() {
    setEditing(null);
    trigger.current?.focus();
  }

  /* Focus moves to the form's BOX, not to its first field: focusing an input on
     a phone opens the keyboard over the sheet the trainer has just asked to see.
     A reader and a keyboard land inside it either way. Escape closes, which is
     the third way out beside the scrim and Cancel. */
  useEffect(() => {
    if (!editing) return;
    /* `preventScroll`, and then the scroll is done by hand — MEASURED BUG.
       `focus()` scrolls its target into view, which is exactly right while the
       form is in the flow and exactly wrong once it is docked: the wrapper is a
       zero-height box left deep in the page, so focusing it scrolled `.body`
       **447px** behind a sheet that had not moved, and dismissing left the
       trainer 447px down a list they had not scrolled. So: never scroll for the
       focus, and scroll to the panel only when the panel is somewhere a scroll
       can reach it. */
    sheet.current?.focus({ preventScroll: true });
    const panel = sheet.current?.firstElementChild;
    if (panel && getComputedStyle(panel).position !== 'fixed') {
      panel.scrollIntoView({ block: 'nearest' });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setEditing(null);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing]);

  const form = editing ? (
    <>
      {/* The scrim exists only below 900px, where the form is a sheet over the
          list rather than a card under it — app.css hides it at a desk, so the
          inline panel keeps every neighbour clickable exactly as before. */}
      <button
        className="pk__scrim"
        type="button"
        aria-label="Close the pack form"
        onClick={close}
      />
    <div className="pk__sheet" ref={sheet} tabIndex={-1}>
    <PackForm
      key={editing.pack?.id ?? `new-${editing.owner}`}
      owner={editing.owner}
      gymName={gym}
      pending={pending}
      seed={editing.pack ? editing.pack.source : null}
      error={formError}
      onSubmit={submit}
      onCancel={close}
    />
    </div>
    </>
  ) : null;

  /** One price list, as a table. Both lists are the same table with different copy. */
  /**
   * One list of prices. A row says what it is (*In person · 12 sessions*), what it
   * costs and — on the gym's list — how the price splits: **You get ₹5,400 · gym
   * keeps ₹3,600**, which the server derived and this only prints. *On it now* and
   * *sold* are the two counts that make retiring or deleting a decision.
   *
   * Three ways to take a pack off the list, and they are not the same: **Retire**
   * stops it being offered and changes nothing anybody bought; **Delete** removes
   * a pack that was never sold; and a Delete the server refuses (`PACK_SOLD`)
   * turns into an offer of Retire right there, because the refusal is a fork in
   * the road and not a dead end.
   */
  function list(rows: PackRow[], owner: 'trainer' | 'gym') {
    const priceLabel = owner === 'gym' ? 'Their price' : 'Price';
    return (
      <div className="tblwrap">
        {/* `data-l` on every cell is not decoration: under 620px app.css hides
            the header and re-prints these as the row's own labels. */}
        <table className={`tbl pk__tbl${owner === 'gym' ? ' pk__tbl--gym' : ''}`}>
          <thead>
            <tr>
              <th>{owner === 'gym' ? 'Package' : 'Pack'}</th>
              <th className="num">{priceLabel}</th>
              {owner === 'gym' && <th className="num">Your part · gym keeps</th>}
              <th className="num">Per session</th>
              <th className="num">On it · sold</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const peers = rows.map((r) => r.source);
              const above = i > 0 ? peers[i - 1] : null;
              const below = i < peers.length - 1 ? peers[i + 1] : null;
              return (
              <tr key={row.id}>
                <td data-l="">
                  <b>{row.name}</b>
                  <span className="small" style={{ display: 'block', color: 'var(--tx-ink-3)' }}>
                    {row.basis === 'period' ? 'Period' : `${row.sessions} sessions`}
                    {' · '}{serviceLabel(row.service)}
                    {row.validityDays != null && ` · valid ${row.validityDays} days`}
                  </span>
                </td>
                <td className="num" data-l={priceLabel}>{rupees(row.amount)}</td>
                {owner === 'gym' && (
                  <td className="num" data-l="Your part · gym keeps">
                    {row.split
                      ? <>{rupees(row.split.trainer)} <span className="small" style={{ color: 'var(--tx-ink-3)' }}>({row.split.trainerLabel})</span>
                          <span className="small" style={{ display: 'block', color: 'var(--tx-ink-3)' }}>gym keeps {rupees(row.split.gym)}</span></>
                      : '—'}
                  </td>
                )}
                <td className="num" data-l="Per session">
                  {row.perSession != null ? rupees(row.perSession) : '—'}
                </td>
                <td className="num" data-l="On it · sold">{row.clients} · {row.sold}</td>
                <td className="pk__acts" style={{ textAlign: 'right' }}>
                  {confirming === row.id ? (
                    <span className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
                        {row.sold > 0 || soldIds.has(row.id)
                          ? `Sold ${row.sold} time${row.sold === 1 ? '' : 's'}; ${row.clients} on it keep${row.clients === 1 ? 's' : ''} what they bought.`
                          : 'Never sold, so it can be removed for good.'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          run(() => setPackStatus(row.id, 'inactive'), `${row.name} retired.`);
                        }}
                      >
                        Retire it
                      </Button>
                      {row.sold === 0 && !soldIds.has(row.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
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
                        >
                          Delete it
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                        Keep selling it
                      </Button>
                    </span>
                  ) : (
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${row.name} up`}
                        disabled={pending || above === null}
                        onClick={() => above && run(
                          () => swapPackOrder(
                            { id: row.id, orderIndex: row.orderIndex },
                            { id: above.id, orderIndex: above.orderIndex },
                          ),
                          `${row.name} moved up.`,
                        )}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${row.name} down`}
                        disabled={pending || below === null}
                        onClick={() => below && run(
                          () => swapPackOrder(
                            { id: row.id, orderIndex: row.orderIndex },
                            { id: below.id, orderIndex: below.orderIndex },
                          ),
                          `${row.name} moved down.`,
                        )}
                      >
                        ↓
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => open(owner, row)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(null);
                          setConfirming(row.id);
                        }}
                      >
                        Remove
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {/*
        A TAB BODY, NOT A SCREEN — and this is the whole of what the fold-in
        changed. What was `<TopBar>` + `<main>` + `.ph` + `.body` is now just the
        contents of the body; `Business.tsx` owns the four wrappers and the tab
        strip that got this component on screen.

        The page heading went with them, and it had to: a second `<h1>` under the
        strip would give the route two titles that disagree about where you are.
        `view.subtitle` was the only thing lost with it, so it is drawn below as
        the section's own line — the sentence that says whether you are looking at
        one price list or two is the sentence this screen is FOR.
      */}
      {/*
        THE SENTENCE, AND NOT A BUTTON BESIDE IT.

        This row used to carry a lime *Add a pack* — inherited from `.ph__acts`
        when the price list was its own route, where there was one list and a
        page-level primary could only have meant one thing. There are TWO here,
        and that is what made it wrong rather than merely duplicated: it was
        hard-coded to `open('trainer')`, so on a screen showing the trainer's
        list beside the gym's, the loudest control on it silently picked one and
        gave the other no way in but a ghost button at the foot of a card. For a
        gym-only trainer it was worse — `disabled`, permanently, as the only
        primary on the tab.

        So each list owns its own add, in its own card header, where the title
        beside it says which list is being added to. Same rule the payments card's chips
        follow: the control goes next to the thing it changes.
      */}
      <div className="pk__hd">
        <p className="small pk__hd__s">{view.subtitle}</p>
      </div>

      {(notice || error) && (
        <p className={error ? 'msg msg--err' : 'msg msg--ok'} style={{ marginBottom: 14 }} role="status">
          <span>
            {error ?? notice}
            {error && refusedCode === 'GYM_PACK_NEEDS_GYM' && (
              <> Add it under <b>Your gym</b> on this page, or on the <a href="/settings/profile/work">Work &amp; hours</a> tab.</>
            )}
          </span>
        </p>
      )}

      {/* `.pk__grid`, NOT `.grid2` with the columns set inline. An inline
          declaration outranks every selector, so the inline version never
          stacked on a phone — see app.css, and see `PacksForm`'s work-mode
          cards, which is the same defect this file's neighbours already
          record. */}
      <div className="pk__grid">
        {/* ── the lists ─────────────────────────────────────────────── */}
        <div>
          {view.showsOwn && (
            <Card>
              <Card.Head title="What you sell" actions={<>{/* Both lists draw *Add a pack*, so the visible label is the
                      same two words in both card headers — it is the card's
                      title that says which. A reader has no card to look at, so
                      the accessible name carries the distinction. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label="Add a pack to your price list"
                    onClick={() => open('trainer', null)}
                  >
                    Add a pack
                  </Button></>}>
                
                <Tag>{view.selling.length}</Tag>
                
              </Card.Head>

              {view.selling.length === 0 ? (
                <Card.Body>
                  <p className="empty__t" style={{ marginBottom: 6 }}>No price list yet</p>
                  <p className="empty__b">
                    Add what you actually charge — a 16-session pack, a monthly fee, a single
                    session. Everything else on this screen is built from it.
                  </p>
                </Card.Body>
              ) : (
                <Card.Body flush>{list(view.selling, 'trainer')}</Card.Body>
              )}

              {editing && editing.owner === 'trainer' && (
                <Card.Body style={{ borderTop: '1px solid var(--tx-line)' }}>{form}</Card.Body>
              )}
            </Card>
          )}

          {/* The gym's own counter prices. Shown only once there is a gym to
              attribute them to — and when there is not, the field to name one
              rather than a group headed by nobody. */}
          {view.showsGym && (
            <div className="card mt4">
              <div className="card__hd">
                <h2 className="card__t">{gym ? `${gym} sells` : 'The gym’s packages'}</h2>
                <Tag>{view.gymSelling.length}</Tag>
                {/* The twin of the own list's, and the control this card never
                    had. Its add used to be *Add another* — a ghost at the FOOT
                    of the card, which is neither where the other list keeps its
                    add nor a label that says what another one would be. Not
                    drawn while the gym is nameless: `gymNeedsName` is the state
                    where the list cannot exist yet, and the body says so. */}
                {!gymNeedsName && (
                  <span className="card__acts">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Add a pack to ${gym ?? 'the gym'}'s price list`}
                      onClick={() => open('gym', null)}
                    >
                      Add a pack
                    </Button>
                  </span>
                )}
              </div>

              {gymNeedsName ? (
                <div className="card__b">
                  <p className="empty__b">
                    Add your gym under <b>Your gym</b> and its price list opens here. An
                    unnamed list belongs to nobody — there would be nothing to head it with,
                    and a package on it could never be attributed.
                  </p>
                </div>
              ) : view.gymSelling.length === 0 ? (
                <div className="card__b">
                  <p className="empty__b">
                    Nothing from {gym} yet. Add what their counter charges and you can pick it
                    when a client pays the gym instead of you.
                  </p>
                </div>
              ) : (
                <div className="card__b card__b--flush">{list(view.gymSelling, 'gym')}</div>
              )}

              {editing && editing.owner === 'gym' && (
                <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>{form}</div>
              )}
            </div>
          )}

          {view.retired.length > 0 && (
            <Card
              title="Retired"
              aside={<><Tag>{view.retired.length}</Tag></>}
              flush
              className="mt4"
            >
              <div className="tblwrap">
                <Table caption="Retired packs, no longer on sale">
                  {view.retired.map((row) => (
                    <Row
                      key={row.id}
                      style={{ color: 'var(--tx-ink-3)' }}
                      cells={[
                        {
                          key: 'pack',
                          content: (
                            <>
                              <b style={{ color: 'var(--tx-ink-2)' }}>{row.name}</b>
                              {row.owner === 'gym' && gym && (
                                <Tag style={{ marginLeft: 8 }}>{gym}</Tag>
                              )}
                            </>
                          ),
                        },
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
                              onClick={() =>
                                run(
                                  () => setPackStatus(row.id, 'active'),
                                  `${row.name} is back on the list.`,
                                )
                              }
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
        </div>

        {/* ── how you work, the callout, and who is running out ──────── */}
        <div>
          <Card title="Your gym">
            <p className="small" style={{ color: 'var(--tx-ink-3)', marginBottom: 10 }}>
              If you work at a gym, name it and its price list opens here — what the gym
              charges, and the part of each sale that is yours. Who collects is still decided
              per client.
            </p>

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

            {gymDraft.trim() !== (data.trainer.gymName ?? '') && (
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => saveGym(gymDraft, gymPlaceDraft, data.trainer.trainingModes),
                      gymDraft.trim() === ''
                        ? 'Saved. Your own price list only.'
                        : `Saved. ${gymDraft.trim()}'s price list is on this screen.`,
                    )
                  }
                >
                  {pending ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGymDraft(data.trainer.gymName ?? '');
                    setGymPlaceDraft(undefined);
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </Card>

          {view.priceNote && (
            <Card
              title="The per-session check"
              tone="acc"
              className="mt4"
            >
              <p className="small" style={{ lineHeight: 1.6 }}>{view.priceNote}</p>
            </Card>
          )}

          {view.ending.length > 0 && (
            <Card
              title="Ending soon"
              aside={<><Tag tone="warn">{view.ending.length}</Tag></>}
              className="mt4"
            >
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
                  {/*
                    TWO VERBS, AND THE NUDGE IS THE ONE THAT USUALLY COMES
                    FIRST.

                    *Renew* opens the client's file and sells the next pack —
                    which a trainer does after the client has agreed to it. The
                    conversation is what has to happen first, and until now this
                    row offered no way to have it: a trainer looking at six
                    packs about to run out had to open six files to send six
                    messages. That is the friction this whole feature exists to
                    remove.

                    `renewal`, so the message names the sessions left rather
                    than asking for money — a pack running out is a renewal
                    conversation, and `payment_reminder` here would read as
                    chasing somebody who owes nothing.
                  */}
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

          {/* A `.card`, not `.why`. §11's `.why` has no BOX rule on this half
              — webapp.css defines only `.why .small`/`.why .kv__k`'s tinted
              text — so it rendered as bare paragraphs on the canvas, with no
              ground, no padding and no border. `RecordPanel` and
              `AddClientDrawer` use it too and pay the same, which is a
              pre-existing gap and not this screen's to close: adding a `.why`
              box would restyle three components in a pass about a fourth. */}
          <Card
            title="A price list is not a sale"
            className="mt4"
          >
            <p className="small" style={{ lineHeight: 1.6 }}>
              Changing a price here never changes a pack somebody already bought. What they
              paid is what they paid — that is a different row, in a different table.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
