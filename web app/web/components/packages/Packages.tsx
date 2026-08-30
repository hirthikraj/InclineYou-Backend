'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Chip, ChipRow } from '@/components/setup/Chips';
import { PackSheet, type PackFields } from '@/components/setup/PackSheet';
import { addPack, savePack, saveWorkMode, setPackStatus } from '@/lib/packs/actions';
import { buildPacks, modeOf, type PackRow, type PacksData } from '@/lib/packs/compute';
import { WORK_MODES, type WorkMode } from '@/lib/setup/options';
import { avatarToken, initials, rupees } from '@/lib/today/time';
import { NudgeButton } from '@/components/nudge/NudgeButton';

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
  const [mode, setMode] = useState<WorkMode>(modeOf(data.trainer));
  const [gymDraft, setGymDraft] = useState(data.trainer.gymName ?? '');

  /** The open form: which list it writes to, and the row it is editing, if any. */
  const [editing, setEditing] = useState<{ owner: 'trainer' | 'gym'; pack: PackRow | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const view = buildPacks({
    packs: data.packs,
    live: data.live,
    clientNames: data.clientNames,
    mode,
    gymName: data.trainer.gymName,
  });

  /** The gym is only real once it has a name — an unnamed list belongs to nobody. */
  const gym = data.trainer.gymName;
  const gymNeedsName = view.showsGym && gym === null;

  function run(work: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setNotice(null);
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok) setNotice(done);
      else setError(result.message ?? 'That did not go through. Nothing changed.');
    });
  }

  function submit(fields: PackFields) {
    const target = editing;
    if (!target) return;
    setEditing(null);
    if (target.pack) {
      run(() => savePack(target.pack!.id, fields), 'Saved. Packs already sold are untouched.');
    } else {
      run(
        () => addPack({ ...fields, owner: target.owner, orderIndex: data.packs.length }),
        target.owner === 'gym'
          ? `${fields.name} added to ${gym ?? 'the gym'}'s list.`
          : `${fields.name} added to your price list.`,
      );
    }
  }

  function open(owner: 'trainer' | 'gym', pack: PackRow | null) {
    setNotice(null);
    setError(null);
    setConfirming(null);
    setEditing({ owner, pack });
  }

  const form = editing ? (
    <PackSheet
      // Read at mount only, so the id is the key — without it, opening a second
      // row would re-show the first row's numbers.
      key={editing.pack?.id ?? `new-${editing.owner}`}
      owner={editing.owner}
      gymName={gym}
      pending={pending}
      seed={
        editing.pack
          ? {
              name: editing.pack.name,
              type: editing.pack.type,
              sessions: editing.pack.sessions,
              amount: editing.pack.amount,
              validityDays: editing.pack.validityDays,
            }
          : null
      }
      submitLabel={editing.pack ? 'Save' : undefined}
      onAdd={submit}
      onCancel={() => setEditing(null)}
    />
  ) : null;

  /** One price list, as a table. Both lists are the same table with different copy. */
  function list(rows: PackRow[], owner: 'trainer' | 'gym') {
    const priceLabel = owner === 'gym' ? 'Their price' : 'Price';
    return (
      <div className="tblwrap">
        {/* `data-l` on every cell is not decoration: under 620px app.css hides
            the header and re-prints these as the row's own labels. Four columns
            of bare rupee figures cannot be read without them, which is why this
            table does NOT reuse `.tbl--stack` — that rule drops the header,
            which the queue can afford and a price list cannot. */}
        <table className="tbl pk__tbl">
          <thead>
            <tr>
              <th>{owner === 'gym' ? 'Package' : 'Pack'}</th>
              <th className="num">{priceLabel}</th>
              <th className="num">Per session</th>
              <th className="num">On it now</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-l="">
                  <b>{row.name}</b>
                  {row.validityDays != null && (
                    <span className="small" style={{ color: 'var(--tx-ink-3)', marginLeft: 8 }}>
                      valid {row.validityDays} days
                    </span>
                  )}
                </td>
                <td className="num mono" data-l={priceLabel}>{rupees(row.amount)}</td>
                <td className="num mono" data-l="Per session">
                  {row.perSession != null ? rupees(row.perSession) : '—'}
                </td>
                <td className="num mono" data-l="On it now">{row.clients}</td>
                <td className="pk__acts" style={{ textAlign: 'right' }}>
                  {confirming === row.id ? (
                    <span className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      <span className="small" style={{ color: 'var(--tx-ink-3)' }}>
                        {row.clients > 0
                          ? `${row.clients} keep${row.clients === 1 ? 's' : ''} what they bought.`
                          : 'It stops being offered.'}
                      </span>
                      <button
                        className="btn btn--sm btn--ghost"
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setConfirming(null);
                          run(() => setPackStatus(row.id, 'inactive'), `${row.name} retired.`);
                        }}
                      >
                        Retire it
                      </button>
                      <button
                        className="btn btn--sm btn--ghost"
                        type="button"
                        onClick={() => setConfirming(null)}
                      >
                        Keep selling it
                      </button>
                    </span>
                  ) : (
                    <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn--sm btn--ghost"
                        type="button"
                        onClick={() => open(owner, row)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn--sm btn--ghost"
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setConfirming(row.id);
                        }}
                      >
                        Retire
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
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
      <div className="pk__hd">
        <p className="small pk__hd__s">{view.subtitle}</p>
        <button
          className="btn btn--primary"
          type="button"
          disabled={pending || !view.showsOwn}
          onClick={() => open('trainer', null)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a pack
        </button>
      </div>

      {(notice || error) && (
        <p className={error ? 'msg msg--err' : 'msg msg--ok'} style={{ marginBottom: 14 }} role="status">
          <span>{error ?? notice}</span>
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
            <div className="card">
              <div className="card__hd">
                <h2 className="card__t">What you sell</h2>
                <span className="tag">{view.selling.length}</span>
                <span className="card__acts" style={{ marginLeft: 'auto' }}>
                  <button
                    className="btn btn--sm btn--secondary"
                    type="button"
                    onClick={() => open('trainer', null)}
                  >
                    Add a pack
                  </button>
                </span>
              </div>

              {view.selling.length === 0 ? (
                <div className="card__b">
                  <p className="empty__t" style={{ marginBottom: 6 }}>No price list yet</p>
                  <p className="empty__b">
                    Add what you actually charge — a 16-session pack, a monthly fee, a single
                    session. Everything else on this screen is built from it.
                  </p>
                </div>
              ) : (
                <div className="card__b card__b--flush">{list(view.selling, 'trainer')}</div>
              )}

              {editing && editing.owner === 'trainer' && (
                <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>{form}</div>
              )}
            </div>
          )}

          {/* The gym's own counter prices. Shown only once there is a gym to
              attribute them to — and when there is not, the field to name one
              rather than a group headed by nobody. */}
          {view.showsGym && (
            <div className="card mt4">
              <div className="card__hd">
                <h2 className="card__t">{gym ? `${gym} sells` : 'The gym’s packages'}</h2>
                <span className="tag">{view.gymSelling.length}</span>
                {data.trainer.gymSharePercent != null && (
                  <p className="small" style={{ color: 'var(--tx-ink-3)', marginLeft: 'auto' }}>
                    {data.trainer.gymSharePercent}% of a floor session goes to them
                  </p>
                )}
              </div>

              {gymNeedsName ? (
                <div className="card__b">
                  <p className="empty__b">
                    Name the gym in <b>How you work</b> and its price list opens here. An
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
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn--secondary"
                      type="button"
                      onClick={() => open('gym', null)}
                    >
                      Add a {gym} package
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="card__b card__b--flush">{list(view.gymSelling, 'gym')}</div>
                  <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>
                    <button className="btn btn--ghost" type="button" onClick={() => open('gym', null)}>
                      Add another
                    </button>
                  </div>
                </>
              )}

              {editing && editing.owner === 'gym' && (
                <div className="card__b" style={{ borderTop: '1px solid var(--tx-line)' }}>{form}</div>
              )}
            </div>
          )}

          {view.retired.length > 0 && (
            <div className="card mt4">
              <div className="card__hd">
                <h2 className="card__t">Retired</h2>
                <span className="tag">{view.retired.length}</span>
              </div>
              <div className="card__b card__b--flush">
                <div className="tblwrap">
                  <table className="tbl">
                    <tbody>
                      {view.retired.map((row) => (
                        <tr key={row.id} style={{ color: 'var(--tx-ink-3)' }}>
                          <td>
                            <b style={{ color: 'var(--tx-ink-2)' }}>{row.name}</b>
                            {row.owner === 'gym' && gym && (
                              <span className="tag" style={{ marginLeft: 8 }}>{gym}</span>
                            )}
                          </td>
                          <td className="num mono">{rupees(row.amount)}</td>
                          <td className="small">
                            {row.clients > 0
                              ? `${row.clients} still on it — no longer offered`
                              : 'No longer offered'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn--sm btn--ghost"
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                run(
                                  () => setPackStatus(row.id, 'active'),
                                  `${row.name} is back on the list.`,
                                )
                              }
                            >
                              Bring back
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── how you work, the callout, and who is running out ──────── */}
        <div>
          <div className="card">
            <div className="card__hd"><h2 className="card__t">How you work</h2></div>
            <div className="card__b">
              <p className="small" style={{ color: 'var(--tx-ink-3)', marginBottom: 10 }}>
                It decides which price lists exist. A hint, never a gate — who collects is
                still decided per client.
              </p>

              {/* The flow's `Chip`, not a raw `.chip` button — this is the
                  same question step 7 asks, and two definitions of one
                  control drift on the next change. It also settles the
                  a11y: `aria-pressed` on a toggle button, never
                  `role="radio"`, which does not support it. */}
              <ChipRow top={0}>
                {WORK_MODES.map((m) => (
                  <Chip
                    key={m.id}
                    label={m.label}
                    pressed={mode === m.id}
                    disabled={pending}
                    onClick={() => setMode(m.id)}
                  />
                ))}
              </ChipRow>
              <p className="small" style={{ color: 'var(--tx-ink-3)', marginTop: 8 }}>
                {WORK_MODES.find((m) => m.id === mode)?.note}
              </p>

              {(mode === 'gym' || mode === 'both') && (
                <div className="fld mt3">
                  <label className="fld__l" htmlFor="pk-gym">Which gym</label>
                  <input
                    className="ctl"
                    id="pk-gym"
                    value={gymDraft}
                    maxLength={80}
                    placeholder="Iron Cage, Anna Nagar"
                    onChange={(e) => setGymDraft(e.target.value)}
                  />
                </div>
              )}

              {(mode !== modeOf(data.trainer) || gymDraft.trim() !== (data.trainer.gymName ?? '')) && (
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => saveWorkMode(mode, gymDraft),
                        mode === 'independent'
                          ? 'Saved. One price list — your own.'
                          : 'Saved. Both lists are on this screen.',
                      )
                    }
                  >
                    {pending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="btn btn--ghost"
                    type="button"
                    onClick={() => {
                      setMode(modeOf(data.trainer));
                      setGymDraft(data.trainer.gymName ?? '');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {view.priceNote && (
            <div className="card card--acc mt4">
              <div className="card__hd"><h2 className="card__t">The per-session check</h2></div>
              <div className="card__b">
                <p className="small" style={{ lineHeight: 1.6 }}>{view.priceNote}</p>
              </div>
            </div>
          )}

          {view.ending.length > 0 && (
            <div className="card mt4">
              <div className="card__hd">
                <h2 className="card__t">Ending soon</h2>
                <span className="tag tag--warn">{view.ending.length}</span>
              </div>
              <div className="card__b">
                <p className="small" style={{ color: 'var(--tx-ink-3)', marginBottom: 10 }}>
                  Renewing is a money decision, so it sits with the prices.
                </p>
                {view.ending.map((row) => (
                  <div className="pk__end" key={row.packageId}>
                    <span className="who" style={{ alignItems: 'flex-start', minWidth: 0 }}>
                      <span className="av av--sm" style={{ background: `var(${avatarToken(row.clientId)})` }}>
                        {initials(row.name)}
                      </span>
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
                      <Link className="btn btn--sm btn--ghost" href={`/clients/${row.clientId}/package`}>
                        Renew
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* A `.card`, not `.why`. §11's `.why` has no BOX rule on this half
              — webapp.css defines only `.why .small`/`.why .kv__k`'s tinted
              text — so it rendered as bare paragraphs on the canvas, with no
              ground, no padding and no border. `RecordPanel` and
              `AddClientDrawer` use it too and pay the same, which is a
              pre-existing gap and not this screen's to close: adding a `.why`
              box would restyle three components in a pass about a fourth. */}
          <div className="card mt4">
            <div className="card__hd"><h2 className="card__t">A price list is not a sale</h2></div>
            <div className="card__b">
              <p className="small" style={{ lineHeight: 1.6 }}>
                Changing a price here never changes a pack somebody already bought. What they
                paid is what they paid — that is a different row, in a different table.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
