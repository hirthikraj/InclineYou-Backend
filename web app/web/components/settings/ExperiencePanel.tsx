'use client';

import { useEffect, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { ExperiencePicker } from '@/components/profile/ExperiencePicker';
import { SaveRow } from '@/components/settings/IdentityForm';
import { usePublishDraft } from '@/components/settings/ProfileDraft';
import type { Message } from '@/lib/auth/copy';
import { saveExperienceBand } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';

/**
 * EXPERIENCE — the profile's third tab, and the shortest one on the screen.
 *
 * Five chips and a button. It could have been a row on the Identity tab and it
 * is not, for the reason `lib/profile/tabs.ts` gives: a tab is a destination,
 * and a destination for one control is cheaper than a scrolling page whose
 * seventh section nobody ever sees. It also keeps the save honest — this tab
 * PATCHes `experienceBand` and nothing else, so changing it can never write back
 * a stale bio the trainer edited on another device.
 *
 * **Nothing here is stored as a number**, which is the whole point of the band
 * and matters more on this screen than in setup: setup is answered once, and a
 * profile sits for years. "3–5 years" is still true next August without anybody
 * opening this tab; "4" is wrong by then, and quietly.
 */
export function ExperiencePanel({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState(initial.experienceBand);
  const [picked, setPicked] = useState(initial.experienceBand);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const publish = usePublishDraft();

  /* The preview card is in the layout and this tab is one of the six that feed
     it. From an EFFECT rather than the picker's own handler: publishing from a
     change handler re-renders the provider's whole subtree synchronously with
     the click, and the chips being pressed are inside it. */
  useEffect(() => {
    publish({ experienceBand: picked });
  }, [publish, picked]);

  const dirty = picked !== saved;

  function submit() {
    if (!picked) {
      setMessage({
        tone: 'err',
        icon: 'warn',
        lead: 'Pick a band first.',
        rest: 'Any of the five — it is stored as a band, not a number, so nothing here needs to be exact.',
      });
      return;
    }
    setMessage(null);
    start(async () => {
      const result = await saveExperienceBand(picked);
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      setSaved(result.identity.experienceBand);
      setPicked(result.identity.experienceBand);
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        rest: 'Clients see this beside what you coach.',
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
      <h2 className="card__t">Experience</h2>
      {/* What to COUNT, which is the question a trainer actually has (from the first client or the first workout?) — the
          storage format it used to explain is the server's business, and "a band" says enough of it. */}
      <p className="small" style={{ marginTop: 3, maxWidth: 560 }}>
        How long you have been coaching clients, counted from your first one. A band, so it stays true next year.
      </p>

      <ExperiencePicker
        value={picked || null}
        disabled={pending}
        onChange={(id) => {
          setPicked(id);
          if (message) setMessage(null);
        }}
      />

      {dirty || pending || message ? <MessageSlot message={message} /> : null}

      <SaveRow pending={pending} dirty={dirty} />
    </form>
  );
}
