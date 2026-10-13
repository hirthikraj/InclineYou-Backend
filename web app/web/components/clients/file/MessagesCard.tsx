'use client';

import { useState, useTransition } from 'react';

import type { ClientMessageWire } from '@/lib/clients/client-api';
import { editMessage, retractMessage, sendMessage } from '@/lib/clients/message-actions';
import { MAX_MESSAGE } from '@/lib/clients/message-limits';
import { relativePast } from '@/lib/today/time';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Checkbox } from '@/web-components/ui/Checkbox';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { RowMenu } from '@/web-components/ui/RowMenu';
import { Tag } from '@/web-components/ui/Tag';
import { Textarea } from '@/web-components/ui/Textarea';

/**
 * MESSAGES TO THE CLIENT — a line in the trainer's own voice, read in the portal (api-contract 1.2, tr-a7).
 *
 * It sits on the Personal information tab beside *Portal access* and appears only for a client who is on the portal: a line
 * can go nowhere else, and a composer that would only ever answer *they haven't joined* is a control to not draw. It is the
 * trainer's door and a one-way one — there is no reply, because the client already has WhatsApp for that — and **nothing is
 * sent to WhatsApp**: the card says so under the box, where the doubt is.
 *
 * ── THE PRIVATE NOTES ARE NOT THIS ───────────────────────────────────────────────────────────────────────────────────────
 * The notes beside it are the trainer's own and stay private unless one is shared. A message is written *for* the client.
 * They are two cards with two headings because a trainer must never have to wonder which of them somebody else will read.
 *
 * ── WHAT A ROW CAN DO ────────────────────────────────────────────────────────────────────────────────────────────────────
 * Reworded **only while it is unread** (the server refuses after, and the menu does not offer it), retracted at any time,
 * with a question first because there is no way back and the client may already have read it. *Opened* is said in words and
 * with the time: the trainer sees whether it landed.
 */
const KIND: Record<ClientMessageWire['kind'], string | null> = {
  note: null,
  weekly: 'This week’s line',
  recap: 'About a session',
};

export function MessagesCard({
  clientId,
  first,
  messages,
  now,
}: {
  clientId: string;
  first: string;
  messages: ClientMessageWire[];
  now: number;
}) {
  const [text, setText] = useState('');
  const [weekly, setWeekly] = useState(false);
  // Minted when the composer opens and kept until the send lands, so a retry answers the message the first press made.
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [retracting, setRetracting] = useState<ClientMessageWire | null>(null);
  const [pending, start] = useTransition();

  const over = text.trim().length > MAX_MESSAGE;

  function send() {
    setError(null);
    start(async () => {
      const r = await sendMessage(clientId, draftId, text, weekly);
      if (!r.ok) {
        setError(r.message ?? 'It did not go through. Nothing changed.');
        return;
      }
      setText('');
      setWeekly(false);
      setDraftId(crypto.randomUUID());
    });
  }

  function save(m: ClientMessageWire) {
    if (!editing) return;
    setError(null);
    start(async () => {
      const r = await editMessage(clientId, m.id, m.version, editing.text);
      if (!r.ok) {
        setError(r.message ?? 'That did not save. Nothing changed.');
        return;
      }
      setEditing(null);
    });
  }

  function retract(m: ClientMessageWire) {
    setError(null);
    start(async () => {
      const r = await retractMessage(clientId, m.id);
      setRetracting(null);
      if (!r.ok) setError(r.message ?? 'That did not go through. Nothing changed.');
    });
  }

  return (
    <Card as="section" title={`Messages to ${first}`} className="cmsg">
      <Textarea
        label={`A line for ${first}`}
        hideLabel
        placeholder="Depth was spot on today."
        hint="They read it in the portal. Nothing goes to WhatsApp."
        rows={3}
        limit={MAX_MESSAGE}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="cmsg__bar">
        <Checkbox label="This week’s line" checked={weekly} disabled={pending} onChange={(e) => setWeekly(e.target.checked)} />
        <Button variant="primary" size="sm" loading={pending && !editing && !retracting} disabled={!text.trim() || over || pending} onClick={send}>
          Send
        </Button>
      </div>

      {error && (
        <Message tone="err" alert style={{ marginTop: 11 }}>
          {error}
        </Message>
      )}

      {messages.length === 0 ? (
        <p className="cmsg__none">Nothing sent yet.</p>
      ) : (
        <ul className="cmsg__l" aria-label={`Messages sent to ${first}`}>
          {messages.map((m) => {
            const kind = KIND[m.kind];
            const unread = m.readAt === null;
            return (
              <li key={m.id} className="cmsg__i">
                {editing?.id === m.id ? (
                  <div className="cmsg__ed">
                    <Textarea
                      label="Reword this message"
                      hideLabel
                      rows={3}
                      limit={MAX_MESSAGE}
                      value={editing.text}
                      disabled={pending}
                      onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                    />
                    <div className="cmsg__ed-bar">
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={pending}
                        disabled={!editing.text.trim() || editing.text.trim().length > MAX_MESSAGE}
                        onClick={() => save(m)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="cmsg__t">{m.body}</p>
                )}
                <div className="cmsg__m">
                  {kind && <Tag tone={m.kind === 'recap' ? 'info' : 'neutral'}>{kind}</Tag>}
                  <span>{relativePast(m.at, now)}</span>
                  <Tag tone={unread ? 'neutral' : 'ok'}>{unread ? 'Not opened' : `Opened ${relativePast(m.readAt!, now)}`}</Tag>
                  <span className="cmsg__sp" />
                  <RowMenu
                    label="This message"
                    items={[
                      ...(unread ? [{ key: 'edit', label: 'Reword it', onSelect: () => setEditing({ id: m.id, text: m.body }) }] : []),
                      { key: 'retract', label: 'Retract it', danger: true, onSelect: () => setRetracting(m) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {retracting && (
        <ModalHost onClose={() => setRetracting(null)} cover="frame">
          <Modal
            title="Retract this message?"
            width={440}
            confirm={{ label: 'Retract', danger: true, onClick: () => retract(retracting) }}
            cancel={{ onClick: () => setRetracting(null) }}
          >
            <p className="cmsg__t">{retracting.body}</p>
            <p className="small ink3">
              It disappears from {first}’s portal. If they have already read it, that can’t be taken back.
            </p>
          </Modal>
        </ModalHost>
      )}
    </Card>
  );
}
