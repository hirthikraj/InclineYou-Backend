'use client';

import { useEffect, useState, useTransition } from 'react';

import { MessageSlot } from '@/components/auth/MessageSlot';
import { LanguagePicker } from '@/components/profile/LanguagePicker';
import { SaveRow } from '@/components/settings/IdentityForm';
import { usePublishDraft } from '@/components/settings/ProfileDraft';
import type { Message } from '@/lib/auth/copy';
import { saveLanguages } from '@/lib/profile/actions';
import type { Identity } from '@/lib/profile/api';

/**
 * LANGUAGES — the profile's fifth tab, and the field no competitor asks for.
 *
 * Zero of the eight platforms in the teardown collect this. In a market where a
 * client may specifically want a Tamil- or Marathi-speaking coach, it is the one
 * thing on this profile that is a differentiator rather than table stakes —
 * which is why setup asks for it at all, and why this tab exists to fill it in
 * for the trainers who skipped it there.
 *
 * No cap. Someone who genuinely coaches in five languages should say so; the
 * argument that caps specialities is about breadth of CLAIM, and a language is a
 * fact about what a session sounds like.
 */
export function LanguagesPanel({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState<string[]>(initial.languages);
  const [chosen, setChosen] = useState<string[]>(initial.languages);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const publish = usePublishDraft();

  /* The preview card is in the layout and this tab is one of the six that feed
     it. From an EFFECT rather than the picker's own handler: publishing from a
     change handler re-renders the provider's whole subtree synchronously with
     the click, and the chips being pressed are inside it. */
  useEffect(() => {
    publish({ languages: chosen });
  }, [publish, chosen]);

  const dirty = chosen.length !== saved.length || chosen.some((id) => !saved.includes(id));

  function submit() {
    setMessage(null);
    start(async () => {
      const result = await saveLanguages(chosen);
      if (!result.ok) {
        setMessage({ tone: 'err', icon: 'warn', lead: result.message });
        return;
      }
      setSaved(result.identity.languages);
      setChosen(result.identity.languages);
      setMessage({
        tone: 'ok',
        icon: 'check',
        lead: 'Saved.',
        rest:
          result.identity.languages.length > 0
            ? 'Clients searching in these will find you.'
            : 'Your profile no longer says which languages you coach in.',
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
      <h2 className="card__t">Languages you coach in</h2>
      <p className="small" style={{ marginTop: 3, maxWidth: 560 }}>
        The ones you actually use on the floor, not the ones you can read. Clients filter on this,
        and no other app in this market asks for it.
      </p>

      <LanguagePicker
        value={chosen}
        disabled={pending}
        idPrefix="pf-lang"
        onChange={(next) => {
          setChosen(next);
          if (message) setMessage(null);
        }}
      />

      <MessageSlot message={message} />

      <SaveRow pending={pending} dirty={dirty} note="Clients searching in these will find you." />
    </form>
  );
}
