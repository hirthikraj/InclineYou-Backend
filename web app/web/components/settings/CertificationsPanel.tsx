'use client';

import { useEffect, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { CertificationPicker } from '@/components/profile/CertificationPicker';
import { SaveRow } from '@/components/settings/IdentityForm';
import { usePublishDraft } from '@/components/settings/ProfileDraft';
import type { Message } from '@/lib/auth/copy';
import { saveCertifications } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';

/**
 * CERTIFICATIONS — the profile's second tab, and the setup step brought over
 * whole.
 *
 * The catalogue, the search over the long tail, *Add your own*, the exclusivity
 * of *Not certified yet* and the callout saying we have not checked any of it
 * are all `CertificationPicker`, the same component setup step 4 renders. It
 * was extracted rather than copied for the reason `lib/setup/options.ts` opens
 * with: two versions of one answer set is how a profile ends up carrying two
 * spellings of one certificate. What is left here is the tab — a heading, a
 * save, and the sentence about what this is for.
 *
 * **The chips do not write on toggle**, which is what a chip usually implies.
 * Every other tab on this screen needs a button, and a section that saved itself
 * mid-click would make one tab behave unlike its neighbours for no reason the
 * trainer can see. It would also fire a request per click on a control whose
 * whole shape invites four in a row.
 *
 * **This is the one thing on this screen the PHONE reads back.** The identity
 * tab's four fields are V33 columns nothing in `app/` knows about;
 * `certifications` is a V8 column that drawer 2a already edits over this same
 * endpoint, and `mergeProfileIntoDraft` folds the server's copy into the local
 * setup draft. So a certificate added here appears on the trainer's phone —
 * with one window where it does not: a phone that finished setup offline holds
 * a pending push, and that push sends the whole draft, so it overwrites this
 * list rather than merging with it. That window closes the moment the phone
 * gets a connection, and it belongs to the setup draft rather than to this tab.
 */
export function CertificationsPanel({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState<string[]>(initial.certifications);
  const [chosen, setChosen] = useState<string[]>(initial.certifications);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const publish = usePublishDraft();

  /* The preview card is in the layout and this tab is one of the six that feed
     it. From an EFFECT rather than the picker's own handler: publishing from a
     change handler re-renders the provider's whole subtree synchronously with
     the click, and the chips being pressed are inside it. */
  useEffect(() => {
    publish({ certifications: chosen });
  }, [publish, chosen]);

  // Order is not meaningful here — the catalogue's order is — so a reorder is
  // not an edit. Comparing as sets stops the unsaved marker appearing after a
  // toggle that put a chip back exactly where it started.
  const dirty =
    chosen.length !== saved.length || chosen.some((id) => !saved.includes(id));

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await saveCertifications(chosen);
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      // The server trims each entry to 80 characters and de-duplicates, so the
      // stored list is not always the one that was sent. Adopting the answer
      // keeps the chips honest.
      setSaved(result.identity.certifications);
      setChosen(result.identity.certifications);
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        rest:
          result.identity.certifications.length > 0
            ? 'Clients see these on your profile, marked self-declared.'
            : 'Your profile no longer lists any.',
      });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="card__t">Certifications</h2>
      {/* One sentence. The licensing background that used to be three lines here is the reason "Not certified yet" is on the
          list; the notice under the chips says the rest, once. */}
      <p className="small" style={{ marginTop: 3 }}>
        Optional. “Not certified yet” is a real answer — India has no licence for personal trainers.
      </p>

      <CertificationPicker
        value={chosen}
        disabled={pending}
        idPrefix="pf-cert"
        onChange={(next) => {
          setChosen(next);
          if (message) setMessage(null);
        }}
      />

      {dirty || pending || message ? <MessageSlot message={message} /> : null}

      <SaveRow pending={pending} dirty={dirty} />
    </form>
  );
}
