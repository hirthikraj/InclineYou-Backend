'use client';

import Link from 'next/link';

import { JOIN_LIMITS } from '@/lib/join/types';
import { Button } from '@/web-components/ui/Button';
import { CoachNote } from '@/web-components/ui/CoachNote';
import { Select } from '@/web-components/ui/Select';
import { Textarea } from '@/web-components/ui/Textarea';

/**
 * THE JOIN PAGE'S ONBOARDING — what a new client from the link gets the moment the trainer approves them (22 Nov 2026 rework).
 *
 * Two things, numbered because they land in that order: (1) a welcome message, posted from the trainer and shown on the
 * client's portal Home and in their messages; (2) a check-in form, an assessment sent at once.
 *
 * ── WHAT THE OLD CARD GOT WRONG ─────────────────────────────────────────────
 * · Its placeholder was a whole finished message in grey, which reads as one already set — while an empty box sends NOTHING.
 *   The box is empty now with a short prompt, "Use a suggested message" fills it on purpose, and the hint says empty = none.
 * · "Posted to their inbox" was half true: the newest message from the trainer is also the one Home leads with. The preview
 *   draws it with Home's own component (`CoachNote`), so what the trainer sees here is what the client sees there.
 * · The check-in was a bare <select>: nothing said what the chosen form asks, and "Clients → Assessments" was text, not a way
 *   there. Now the choice says how many measurements and questions it has, and the way to build one is a link.
 */
const SUGGESTED =
  'Welcome! Have a look around the app — your sessions, your plan and what you owe are all here. I’ll set up your first week after we meet.';

export function JoinOnboarding({
  message,
  onMessage,
  templateId,
  onTemplate,
  templates,
  trainerName,
}: {
  message: string;
  onMessage: (text: string) => void;
  templateId: string;
  onTemplate: (id: string) => void;
  /** Null when the shelf could not be read. */
  templates: { id: string; name: string; measurements: number; questions: number }[] | null;
  trainerName: string;
}) {
  const chosen = templates?.find((t) => t.id === templateId) ?? null;
  const asks = chosen ? whatItAsks(chosen.measurements, chosen.questions) : null;

  return (
    <ol className="jlo">
      <li className="jlo__step">
        <span className="jlo__n" aria-hidden="true">1</span>
        <div className="jlo__b">
          <Textarea
            label="Welcome message"
            rows={4}
            limit={JOIN_LIMITS.welcomeMessage}
            hint="From you, on their Home and in their messages. Leave it empty to send none."
            placeholder="A few lines to welcome them…"
            value={message}
            onChange={(e) => onMessage(e.target.value)}
          />
          {message.trim() === '' ? (
            <Button variant="ghost" size="sm" className="jlo__fill" onClick={() => onMessage(SUGGESTED)}>
              Use a suggested message
            </Button>
          ) : (
            <div className="jlo__preview" aria-label="How it shows on their Home">
              <span className="jlo__k">On their Home</span>
              <CoachNote author={trainerName || 'You'}>{message.trim()}</CoachNote>
            </div>
          )}
        </div>
      </li>

      <li className="jlo__step">
        <span className="jlo__n" aria-hidden="true">2</span>
        <div className="jlo__b">
          {templates === null ? (
            <p className="small jlo__msg">Your assessment templates couldn’t be loaded, so the first assessment can’t be changed right now. Reload to try again.</p>
          ) : templates.length === 0 ? (
            <>
              <span className="jlo__t">First assessment</span>
              <p className="small jlo__msg">
                You have no assessment templates yet.{' '}
                <Link className="inv-link" href="/clients/assessments/templates">Create one</Link> to send new clients a first assessment
                the moment you approve them.
              </p>
            </>
          ) : (
            <>
              <Select
                label="First assessment"
                hint={
                  chosen
                    ? `Asks ${asks}. Sent the moment you approve them, waiting on their Home.`
                    : 'An assessment sent the moment you approve them — their goals, a baseline, anything you need before the first session.'
                }
                value={templateId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onTemplate(e.target.value)}
                options={[{ value: '', label: 'Don’t send one' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
              />
              <Link className="inv-link small jlo__lk" href="/clients/assessments/templates">Manage assessment templates</Link>
            </>
          )}
        </div>
      </li>
    </ol>
  );
}

/** "4 measurements and 6 questions", "2 questions", "nothing yet". */
function whatItAsks(measurements: number, questions: number): string {
  const parts = [
    measurements ? `${measurements} measurement${measurements === 1 ? '' : 's'}` : null,
    questions ? `${questions} question${questions === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : 'nothing yet — add measurements or questions to it first';
}
