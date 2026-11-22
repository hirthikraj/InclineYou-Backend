'use client';

import { useState } from 'react';

import { formatPhone } from '@/lib/auth/policy';
import { waUrl } from '@/lib/clients/invite-types';
import { Avatar } from '@/web-components/ui/Avatar';
import { Button } from '@/web-components/ui/Button';
import { Message } from '@/web-components/ui/Message';
import { Modal, ModalHost } from '@/web-components/ui/Modal';
import { QrCode } from '@/web-components/ui/QrCode';
import { Textarea } from '@/web-components/ui/Textarea';

/**
 * THE SEND SHEET — where a trainer reads the invitation and sends it themselves.
 *
 * InclineYou sends nothing. The message goes from the trainer's own WhatsApp, so a client's first message from this
 * product is from someone they know; the platform's only part is the personal link inside it. The draft is the server's
 * built-in wording and is editable here: the `wa.me` URL is rebuilt from whatever the box says, so an edit is what is
 * sent. Deleting the link from the text is allowed and is the trainer's call — it just sends a message with nothing to
 * open — which is why the sheet says so the moment it happens.
 *
 * THE PERSON IS SHOWN, with their number. The WhatsApp link opens a chat with exactly that number, and a trainer
 * pressing *Open WhatsApp* should be able to see who is about to get the message without leaving the sheet.
 *
 * ONE PRIMARY, AND IT IS THE SEND. *Open WhatsApp* is what the sheet is for; *Copy message* is the way out for a
 * trainer on a machine with no WhatsApp, and *Done* is the way out of a sheet they have finished with.
 *
 * `link` is the raw token's only appearance. It lives in this component's props for as long as the sheet is open and
 * is never put in the URL or in storage; closing the sheet is the last time anyone will see it, and a lost one is
 * replaced by inviting again.
 */
export function InviteSheet({
  clientId,
  clientName,
  phone,
  draft,
  link,
  onClose,
}: {
  clientId?: string;
  clientName: string;
  phone: string;
  draft: string;
  link: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(draft);
  const [copied, setCopied] = useState(false);
  /* THE CLIENT IS STANDING HERE (22 Nov 2026). Consent comes before a third session, and on a gym floor the
     quickest way to it is the client scanning the link off this screen and accepting on their own phone — the
     same page, the same code to their number. The QR is the link itself; nothing about it is different. */
  const [qr, setQr] = useState(false);
  const missingLink = !text.includes(link);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <ModalHost onClose={onClose} cover="frame" initialFocus="textarea">
      <Modal
        title={`Invite ${clientName}`}
        width={520}
        foot={
          <>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button variant="secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy message'}
            </Button>
            <Button variant="primary" href={waUrl(phone, text)} target="_blank" rel="noopener noreferrer">
              Open WhatsApp
            </Button>
          </>
        }
      >
        <div className="ivns">
          <div className="ivns__to">
            <Avatar name={clientName} id={clientId} size="md" />
            <span className="ivn__id">
              <b className="ivn__nm">{clientName}</b>
              <span className="ivn__ph">{formatPhone(phone)}</span>
            </span>
          </div>
          <div className="ivns__msg">
            <Textarea
              label="Message"
              hint="Edit it if you like. It goes from your own WhatsApp."
              rows={6}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCopied(false);
              }}
            />
          </div>
          {missingLink && (
            <div role="status">
              <Message tone="warn">
                The personal link is no longer in the message, so {clientName} would have nothing to open.
              </Message>
            </div>
          )}
          {qr ? (
            <div className="ivns__qr">
              <QrCode value={link} label={`Invite link for ${clientName}`} size={196} />
              <p className="ivns__meta">
                {clientName.split(' ')[0]} scans this with their phone camera, enters their date of birth, ticks the two
                consents and types the code sent to {formatPhone(phone)}.
              </p>
              <Button variant="ghost" size="sm" onClick={() => setQr(false)}>Hide the QR code</Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setQr(true)}>
              {clientName.split(' ')[0]} is here? Show a QR code to scan
            </Button>
          )}
          <p className="ivns__meta">
            InclineYou sends nothing. The link works for 14 days and replaces any link you sent before.
          </p>
        </div>
      </Modal>
    </ModalHost>
  );
}
