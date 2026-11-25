'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { saveJoinLink } from '@/lib/join/actions';
import type { JoinLinkData } from '@/lib/join/api';
import { JOIN_LIMITS, type JoinLinkWire, type JoinQuestion } from '@/lib/join/types';
import { Check, Copy, Download, ExternalLink, Instagram, WhatsApp } from '@/components/shell/Icons';
import { TopBar } from '@/components/shell/TopBar';
import { SaveRow } from '@/components/settings/IdentityForm';
import { Button } from '@/web-components/ui/Button';
import { Card } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { QrCode } from '@/web-components/ui/QrCode';
import { Switch } from '@/web-components/ui/Switch';
import { Tag } from '@/web-components/ui/Tag';
import { TextField } from '@/web-components/ui/Field';
import { ClientsTabs } from './JoinTabs';
import { JoinPlans } from './JoinPlans';
import { JoinOnboarding } from './JoinOnboarding';
import { QuestionBuilder } from '@/components/assessments/QuestionBuilder';

/**
 * `/clients/join-link` — THE TRAINER'S PUBLIC JOIN PAGE, AND EVERYTHING ON IT (api-contract 1.2, jl-a1/jl-a2; V45).
 *
 * Two cards: the link itself (on or off, the address, the QR code and the four ways to share it) and the settings (what the
 * page says, what it asks, which plans it offers, what a new client gets when the trainer approves them).
 *
 * ── WHAT IS NOT HERE, ON PURPOSE ────────────────────────────────────────────
 * · **No *Accept automatically*.** Every join waits in Join requests: approving is adding, which is what keeps "only a number a
 *   trainer added can sign in" true (decided 22 Nov 2026).
 * · **No online payment.** There is no gateway at launch; plans on the page are paid to the trainer directly, and approving a
 *   request goes on to *Sell a pack* in the money book.
 * · **No welcome email.** There is no mail transport; the welcome message lands in the client's portal inbox.
 *
 * One form, one Save: the server takes the whole thing (PUT), so two halves of the page can never land half-way.
 */
type Draft = {
  slug: string;
  takingJoins: boolean;
  welcomeLine: string;
  questions: JoinQuestion[];
  packIds: string[];
  allowNoPlan: boolean;
  welcomeMessage: string;
  checkInTemplateId: string;
};

function draftOf(l: JoinLinkWire): Draft {
  return {
    slug: l.slug,
    takingJoins: l.takingJoins,
    welcomeLine: l.welcomeLine ?? '',
    questions: l.questions,
    packIds: l.packIds,
    allowNoPlan: l.allowNoPlan,
    welcomeMessage: l.welcomeMessage ?? '',
    checkInTemplateId: l.checkInTemplateId ?? '',
  };
}


export function JoinLink({ data }: { data: JoinLinkData }) {
  const router = useRouter();
  const [saved, setSaved] = useState<JoinLinkWire>(data.link);
  const [draft, setDraft] = useState<Draft>(() => draftOf(data.link));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved)) || !saved.exists;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDone(null);
  };

  const url = saved.url;
  const live = saved.exists && saved.takingJoins;
  const packsById = new Map(data.packs.map((p) => [p.id, p]));
  const offered = draft.packIds.filter((id) => packsById.has(id));

  function save(next: Draft = draft) {
    const badQ = next.questions.findIndex((q) => !q.text.trim() || (q.kind === 'choice' && q.options.filter((o) => o.text.trim()).length < 2));
    if (badQ >= 0) {
      setError(`Question ${badQ + 1} needs ${next.questions[badQ].text.trim() ? 'at least two answers to pick from' : 'its wording'}.`);
      return;
    }
    setError(null);
    start(async () => {
      const r = await saveJoinLink({
        // Ignored by the server since 22 Nov 2026: the link is the business name, made once and never edited.
        slug: saved.slug,
        takingJoins: next.takingJoins,
        welcomeLine: next.welcomeLine.trim() || null,
        questions: next.questions.map((q) => ({
          ...q,
          text: q.text.trim(),
          options: q.kind === 'choice' ? q.options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text) : [],
        })),
        packIds: next.packIds.filter((id) => packsById.has(id)),
        allowNoPlan: next.allowNoPlan || next.packIds.filter((id) => packsById.has(id)).length === 0,
        welcomeMessage: next.welcomeMessage.trim() || null,
        checkInTemplateId: next.checkInTemplateId || null,
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSaved(r.link);
      setDraft(draftOf(r.link));
      setDone(r.link.takingJoins ? 'Saved. Your join page is live.' : 'Saved. The page is off until you turn on Take joins.');
      router.refresh();
    });
  }

  /** The on/off switch saves at once — it is the one control a trainer reaches for in a hurry ("I'm full"). */
  function toggleLive(on: boolean) {
    const next = { ...draft, takingJoins: on };
    setDraft(next);
    save(next);
  }

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2500);
    } catch {
      setError('Your browser would not copy. Select the link and copy it by hand.');
    }
  }

  const bio = `${(saved.welcomeLine ?? 'Train with me').slice(0, 100)} 👉 ${url}`.slice(0, 150);
  const waText = `${saved.welcomeLine ?? `Want to train with me?`} Ask to join here: ${url}`;

  function downloadPng() {
    // The 1024px copy, drawn hidden beside the visible one: a PNG of the screen-sized code would print soft.
    const svg = document.querySelector('#jl-qr-src svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `join-${saved.slug}.png`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  }



  return (
    <>
      <TopBar crumb="Clients" title="Join link" />
      <main className="main body--flush jl" id="main-content">
        <PageHeader
          className="ph--pglist"
          title="Join link"
          sub="One link for your bio, your status and the gym wall. People ask to train with you; you say yes."
        >
          <ClientsTabs current="link" joining={data.pending} />
        </PageHeader>

        <div className="jl__body">
          {error && <Message tone="err" alert>{error}</Message>}

          <Card as="section" className="jl-link" title={<>Your join page {live ? <Tag tone="ok">Live</Tag> : <Tag tone="neutral">Off</Tag>}</>}
            actions={
              <span className="jl-live">
                <span className="jl-live__l" id="jl-live-l">Take joins</span>
                <Switch checked={draft.takingJoins} onChange={toggleLive} label="Take joins" disabled={pending} />
              </span>
            }
          >
            <div className="jl-link__grid">
              <div className="jl-link__main">
                <p className="jl-link__lead">
                  Put it in your Instagram bio, your WhatsApp status or on the gym wall. People fill in a short form and wait in
                  Join requests until you approve them.
                </p>
                {/* THE LINK IS THE BUSINESS NAME, AND IT IS NOT EDITABLE (22 Nov 2026, the owner's call). Made from Settings →
                    Business's name the first time the page is saved and fixed after — a rename does not move it, so a QR code
                    already on a wall keeps working. Shown as a fact, not as a field: an input that cannot be typed in is a
                    control that does nothing. */}
                <div className="jl-url">
                  <span className="jl-url__l">Your link</span>
                  <code className="jl-url__v">{url}</code>
                  <span className="small">
                    {saved.exists
                      ? 'Made from your business name. It stays the same even if you rename the business, so shared links and QR codes keep working.'
                      : 'Made from your business name when you first save. Set the name in Settings → Business.'}
                  </span>
                </div>
                {saved.exists ? (
                  <div className="jl-share">
                    <Button size="sm" variant="secondary" icon={<ExternalLink size={15} />} href={url} target="_blank" rel="noopener noreferrer">Preview</Button>
                    <Button size="sm" variant="secondary" icon={<WhatsApp size={15} />} href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
                      Share on WhatsApp
                    </Button>
                    <Button size="sm" variant="secondary" icon={<Instagram size={15} />} onClick={() => copy('bio', bio)}>
                      {/* One span: the button is a flex row with a 7px gap, and three loose text pieces became three
                          flex items — "Copy for  Instagram  bio". */}
                      {copied === 'bio' ? 'Copied for your bio' : <span>Copy for <span className="jl-wide">Instagram </span>bio</span>}
                    </Button>
                    <Button size="sm" variant="secondary" icon={copied === 'link' ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy('link', url)}>
                      {copied === 'link' ? 'Link copied' : 'Copy link'}
                    </Button>
                    {/* Sharing still works while it is off, and nothing said what a person who opens it would
                        meet (24 Nov 2026). The words are the public page's own. */}
                    {!live && (
                      <p className="small jl-offnote">
                        It’s off: anyone who opens it now sees “This page isn’t taking new clients” until you turn on <b>Take joins</b>.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="small">Save once to make the link. It stays off until you turn on <b>Take joins</b>.</p>
                )}
              </div>
              {saved.exists && (
                <div className="jl-qr">
                  <QrCode value={url} label={`QR code for ${url}`} size={148} className="jl-qr__c" />
                  <span id="jl-qr-src" hidden>
                    <QrCode value={url} label="" size={1024} />
                  </span>
                  <Button size="sm" variant="secondary" icon={<Download size={15} />} onClick={downloadPng}>Download PNG</Button>
                </div>
              )}
            </div>
          </Card>

          <form
            className="jl-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {/* The cards are a grid of their own so the save row below is NOT a grid item: a sticky grid item can only move
                inside its own cell, which is exactly its size, so it never stuck. Inside the plain form it sticks. */}
            <div className="jl-set">
            <Card as="section" title="Page" aside="What people see at the top of your join page.">
              <TextField
                label="Welcome line"
                placeholder="Train with me: online or at the studio"
                value={draft.welcomeLine}
                maxLength={JOIN_LIMITS.welcomeLine}
                hint={`${draft.welcomeLine.length}/${JOIN_LIMITS.welcomeLine}`}
                onChange={(e) => set('welcomeLine', e.target.value)}
              />
              <p className="small">Your name, headline, bio and certifications come from your profile.</p>
            </Card>

            <Card as="section" title="Questions" aside={`Name, mobile and date of birth are always asked. Add up to ${JOIN_LIMITS.questions} of your own.`}>
              <p className="small jl-warn">Don’t ask about health, injuries or medication here — that waits until they’re your client, in an assessment.</p>
              {/* THE ASSESSMENT'S OWN BUILDER (22 Nov 2026, the owner's call): the same four answer types, cards and
                  ordering a trainer already knows from Clients → Assessments. No suggested-question bank — that catalogue
                  asks about health, which this page must not — and a Required switch the assessment does not have. */}
              <QuestionBuilder
                items={draft.questions}
                onChange={(next) =>
                  set('questions', next.map((q) => ({ ...q, required: draft.questions.find((x) => x.id === q.id)?.required ?? false })))
                }
                required={{
                  of: (id) => draft.questions.find((q) => q.id === id)?.required ?? false,
                  set: (id, on) => set('questions', draft.questions.map((q) => (q.id === id ? { ...q, required: on } : q))),
                }}
                max={JOIN_LIMITS.questions}
                listLabel="Questions on your join page"
              />
            </Card>

            <Card as="section" title="Plans" aside="Packs people can pick on your page. They pay you directly.">
              <JoinPlans
                packs={data.packs}
                offered={offered}
                onChange={(ids) => set('packIds', ids)}
                allowNoPlan={draft.allowNoPlan}
                onAllowNoPlan={(on) => set('allowNoPlan', on)}
                max={JOIN_LIMITS.plans}
              />
            </Card>

            <Card as="section" title="Onboarding" aside="What a new client gets the moment you approve them.">
              <JoinOnboarding
                message={draft.welcomeMessage}
                onMessage={(t) => set('welcomeMessage', t)}
                templateId={draft.checkInTemplateId}
                onTemplate={(id) => set('checkInTemplateId', id)}
                templates={data.templates}
                trainerName={data.trainerName}
              />
            </Card>
            </div>

            <div className="jl-save">
              {done && !dirty && <Message tone="ok">{done}</Message>}
              {/* The confirmation already says it is saved; the resting note is for arriving on a saved page. */}
              <SaveRow pending={pending} dirty={dirty} note={saved.exists && !done ? 'Everything is saved.' : undefined} />
              {dirty && !pending && saved.exists && (
                <Button variant="ghost" onClick={() => { setDraft(draftOf(saved)); setError(null); }}>Discard</Button>
              )}
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
