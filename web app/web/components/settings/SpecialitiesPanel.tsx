'use client';

import { useEffect, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { SpecialityPicker } from '@/components/profile/SpecialityPicker';
import { SaveRow } from '@/components/settings/IdentityForm';
import { usePublishDraft } from '@/components/settings/ProfileDraft';
import type { Message } from '@/lib/auth/copy';
import { saveSpecialities } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';
import { SPECIALITY_CAP } from '@/lib/setup/options';

/**
 * SPECIALITIES — the profile's fourth tab, and the first thing a client reads
 * about a trainer after their name.
 *
 * The chips, the live counter and the refusal at the cap are
 * `SpecialityPicker`, the same component setup step 3 renders. The cap of five
 * is the product's argument and not this screen's: a trainer who "does
 * everything" tells a client nothing.
 *
 * **This tab can empty the list, and setup cannot.** Step 3 refuses to CONTINUE
 * on an empty answer — it has a Skip now, but a Skip records "not today" rather
 * than clearing a list — which leaves it unable to remove an answer already
 * given; its own comment says so and names Settings as where that belongs. This is Settings. Clearing every chip and pressing Save sends
 * `[]`, which the server reads as *clear it*, so the one thing the flow could
 * not do is the one thing this tab adds.
 */
export function SpecialitiesPanel({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState<string[]>(initial.specialities);
  const [chosen, setChosen] = useState<string[]>(initial.specialities);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const publish = usePublishDraft();

  /* The preview card is in the layout and this tab is one of the six that feed
     it. From an EFFECT rather than the picker's own handler: publishing from a
     change handler re-renders the provider's whole subtree synchronously with
     the click, and the chips being pressed are inside it. */
  useEffect(() => {
    publish({ specialities: chosen });
  }, [publish, chosen]);

  // Compared as sets, like the certifications tab: the catalogue's order is the
  // meaningful one, so a toggle that put a chip back where it started is not an
  // edit and must not raise the unsaved marker.
  const dirty = chosen.length !== saved.length || chosen.some((id) => !saved.includes(id));

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await saveSpecialities(chosen);
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      // The server trims and de-duplicates, so the stored list is not always
      // the one that was sent. Adopting the answer keeps the chips honest.
      setSaved(result.identity.specialities);
      setChosen(result.identity.specialities);
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        rest:
          result.identity.specialities.length > 0
            ? 'These lead your profile, under your name.'
            : 'Your profile no longer says what you coach.',
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
      <h2 className="card__t">What you coach best</h2>
      <p className="small" style={{ marginTop: 3, maxWidth: 560 }}>
        Up to {SPECIALITY_CAP}, and the cap is the point — a trainer who does everything tells a
        client nothing. Add your own if the list has missed one.
      </p>

      <SpecialityPicker
        value={chosen}
        disabled={pending}
        idPrefix="pf-spec"
        onChange={(next) => {
          setChosen(next);
          if (message) setMessage(null);
        }}
      />

      <MessageSlot message={message} />

      <SaveRow
        pending={pending}
        dirty={dirty}
        note="The first thing a client reads about you, after your name."
      />
    </form>
  );
}
