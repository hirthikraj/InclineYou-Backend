'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';


import type { BuilderData, CertifiedWire, ShelfData } from '@/lib/programs/api';
import {
  certifiedChoices,
  createFromTemplate,
  createTemplate,
  type StartChoice,
} from '@/lib/programs/actions';
import { GOALS } from '@/lib/programs/blueprint';
import { useToast } from '@/lib/toast/store';
import { TopBar } from '@/components/shell/TopBar';
import { Builder } from './Builder';
import { CertifiedCard } from './CertifiedCard';
import { CloseIcon, PlusIcon, SearchIcon } from './Icons';
import { ProgramSwitcher } from './ProgramSwitcher';
import { Shelf } from './Shelf';
import { PageTabs } from '@/components/shell/PageTabs';
import { SubTabs } from '@/web-components/ui/SubTabs';
import { programsTabs, templateTabs } from '@/lib/programs/tabs';
import { Button } from '@/web-components/ui/Button';
import { Chip } from '@/web-components/ui/Chip';
import { TextField } from '@/web-components/ui/Field';
import { FormGroup } from '@/web-components/ui/FormGroup';
import { Message } from '@/web-components/ui/Message';
import { ModalHost } from '@/web-components/ui/Modal';
import { PageHeader } from '@/web-components/ui/PageHeader';
import { SearchSelect } from '@/web-components/ui/SearchSelect';
import { Textarea } from '@/web-components/ui/Textarea';
import { DockPanel } from '@/web-components/ui/DockPanel';

/**
 * `/programs` AND `/programs/:id` — one screen, two states.
 *
 * "The list and the builder are one screen" is the information architecture's
 * own row for this route, and what the page this replaces did not do: it had
 * three template chips in a toolbar and no way to see six programs, their shape,
 * or who was on them.
 *
 * With a program open the BUILDER owns the page — header and plane, the whole
 * width — because everything the header says belongs to the draft it is holding.
 *
 * With nothing open this file used to draw the shelf beside an empty pane. It
 * draws the shelf as a FULL-WIDTH TABLE instead: measured at 1440, the pane was
 * 976 x 717 holding the sentence *Pick a program to open it.* while the list it
 * was beside had 400px, and a list-detail split whose detail half is a whole
 * separate route can never fill. `Shelf`'s own header block carries the
 * argument; `app.css` had already made it for the phone.
 */
export function Programs({
  data,
  open,
  recommended = [],
  certifiedCount,
  now,
}: {
  data: ShelfData;
  /** The template being built, when the URL names one. */
  open: BuilderData | null;
  /** The three most-used certified programs, for the first-run branch ONLY.
   *  Fetched by the page only when the shelf is empty — a trainer with six
   *  programs must not pay for a catalogue this screen will not draw. */
  recommended?: CertifiedWire[];
  certifiedCount?: number | null;
  /** The server's clock, for *edited today*. `Shelf`'s `now` prop says why it
   *  cannot be read during render. */
  now: number;
}) {
  const [creating, setCreating] = useState(false);
  /* THE LIST'S QUERY, HELD HERE because the FIELD is drawn here — on the tab
     strip's row rather than inside the list's own header. `Shelf` takes it as
     `search` and then draws no field of its own; see that prop's note. It is
     not in the URL for `AGENTS.md`'s standing reason: the URL carries what is
     FETCHED, and a filter over rows the page already holds is state. */
  const [query, setQuery] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const templates = open ? open.templates : data.templates;

  /* THE SHELF BEHIND THE PROGRAM'S NAME, and it is built here rather than
     inside the builder because this file owns the shelf's data and the builder
     is handed it as an opaque node. It is the only way back to the other
     programs from an open one — `ProgramSwitcher`'s own header carries the
     argument. */
  /* WHETHER THE SHEET IS OPEN IS LIFTED HERE, and it is not a preference.
     `PhoneProgram`'s Escape ladder stands down on a `covered` prop that only
     `Builder` can set, and this sheet is built in this file and handed to the
     builder as an opaque node — so the one component that can see the sheet
     open cannot tell the one component that has to know. Held here, passed
     down, and the switcher writes it.

     Without it: open a day, tap the program name, press Escape, and the DAY
     closes under a sheet that stays. Measured. */
  const switcher = open ? (
    <ProgramSwitcher
      name={open.template.name}
      count={templates.length}
      onOpenChange={setSwitcherOpen}
    >
      <Shelf
        variant="sheet"
        templates={templates}
        selectedId={open.template.id}
        onNew={() => setCreating(true)}
        now={now}
      />
    </ProgramSwitcher>
  ) : null;

  return (
    <>
      {/* THE BAR SAYS THE SECTION AND IS THE WAY BACK TO IT.
          `screenTitle` cannot derive either, and the way it fails is silent: it
          splits the crumb on `/` AND `·` and takes the last segment, which is
          right for `Clients / Meera K` and wrong for every program in the
          catalogue, because a trainer's naming convention IS those two
          characters — `Upper / Lower · 4 day` came out as *"4 day"*, and nine of
          nine seeded names carry a `·`.

          PASSING THE PROGRAM'S NAME WAS THE FIRST FIX AND IT WAS HALF WRONG.
          It stopped the bar naming the shape and started it naming what the
          switcher 46px below already names — and MEASURED at 390px neither copy
          was complete: 208px in the bar, 184px in the switcher, of a string
          needing 244. Two truncations of one name.

          So the name stays with the switcher, where it is a control, and the bar
          takes the one thing nothing else on this screen says: which section
          this is. `.ph--builder` hides the tab strip and `HIDDEN_FROM_BAR` keeps
          Programs out of the bar's five slots, so *Programs* was unsaid and the
          shelf was unreachable in one tap. `titleHref` makes the word its own
          destination. The crumb keeps the full path for the desk, where the bar
          draws no title at all and the path is a path. */}
      <TopBar
        crumb={open ? `Fitness · Templates · ${open.template.name}` : 'Fitness · Templates'}
        title="Templates"
        titleHref={open ? '/programs/templates' : undefined}
      />

      <main className="main body--flush pg" id="main-content">
        {open ? (
          <Builder
            template={open.template}
            assignments={open.assignments}
            clients={open.clients}
            names={open.names}
            switcher={switcher}
            switcherOpen={switcherOpen}
          />
        ) : templates.length === 0 ? (
          /* FIRST RUN — the whole width, because it holds three cards. The
             list-detail split is a shape for choosing between programs, and
             there are none. */
          <FirstRun
            recommended={recommended}
            certifiedCount={certifiedCount}
            onNew={() => setCreating(true)}
          />
        ) : (
          <>
            {/* `ph--pglist` — the class per screen the stylesheet's own
                `/today` note asks for. On a phone it stands the headline and the
                *New program* button down: the crumb and the active tab both say
                *Programs*, and the shelf's foot already carries a full-width
                *New program* inside the thumb's arc. */}
            <div className="ph ph--pglist ph--pgshelf">
              <div className="ph__row">
                <div>
                  <h1 className="ph__t">Templates</h1>
                  {/* THE SUBTITLE SAYS WHAT THE COUNT COULD NOT. *5 programs on
                      the shelf* restated the five rows below it and the tab
                      strip beside it — three copies of one number on one band.
                      The two facts it says instead are the ones no column
                      answers by being scanned: how many PEOPLE this shelf is
                      currently carrying, which is the only figure on the screen
                      that is about the practice rather than about the
                      blueprints, and how many blueprints are reaching nobody,
                      which is the one actionable state a shelf can be in.

                      The second clause is dropped when it is zero. *0 reaching
                      nobody* is a congratulation, and a header is not the place
                      for one. */}
                  <p className="ph__sub">{shelfLine(templates)}</p>
                </div>
                <div className="ph__acts">
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    <PlusIcon />
                    New template
                  </Button>
                </div>
              </div>

              {/* THE STRIP, AND *TEMPLATES* IS THE OTHER HALF OF IT. It was a
                  row of the Fitness pane and is a view of this page — one
                  question, *which blueprint do I start from*, asked of two
                  shelves. `lib/programs/tabs.ts` carries the argument and owns
                  the list, so this screen and the catalogue cannot disagree
                  about what is on the strip or which of them is current.

                  INSIDE `.ph`, WHICH IS NOT A TIDINESS POINT. `.ph__tabs`
                  carries a negative inline margin so the strip scrolls edge to
                  edge on a phone, and that margin is sized to cancel `.ph`'s
                  own `--w-gutter`. Drawn as a SIBLING of the header it has no
                  padding to cancel and simply overhangs: MEASURED at 390 the
                  nav sat at −24 → 414 inside a 390px box, against 390/0 on
                  `/business` and `/clients`, which put it where every other
                  call-site does.

                  `push`, not `replace`: the other tab is a different fetch,
                  which is exactly the line `PageTabs` draws. */}
              <div className="pgtabs">
                <PageTabs
                  label="Fitness"
                  current="templates"
                  tabs={programsTabs('templates', { programs: null })}
                />

                {/* THE SEARCH, ON THE STRIP'S ROW AND RANGED RIGHT — under the
                    primary, which is the column a trainer's pointer is already
                    in. It was the first thing inside the list's own header,
                    which cost a full 44px band above the sort chips to hold one
                    260px control, and put the field that narrows the list
                    further from the tabs that CHANGE the list than from the
                    rows themselves.

                    The query lives here because the field does: `Shelf` takes
                    `search` and then draws neither, which is the whole of that
                    prop's contract. It stays on `/programs` only — the pane and
                    the sheet have no strip to sit on and keep their own. */}
                <label className="search pgtabs__q">
                  <SearchIcon />
                  <input
                    type="search"
                    /* *plans* was the one word on this screen for a thing the
                       rest of it calls a PROGRAM — the heading, the tab, the
                       column head, the primary button and the empty state all
                       say program, and the field a trainer types into said
                       something else. `aria-label` had it right already, which
                       is how it survived: the two were never read together. */
                    placeholder="Search your templates"
                    aria-label="Search your templates"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* THE SECOND LEVEL, AND IT IS OUTSIDE `.ph` ON PURPOSE. `.ph` is
                `padding-bottom:0` so the active `.tab`'s underline lands on the
                rule under the header — `.pgtabs`' own note — and a row drawn
                inside would push that underline off the rule it exists to meet.
                `c-subtabs` carries the rest of the argument, including why it
                is pills rather than a second underline strip.

                The count on the other shelf is the catalogue's, which is the
                read this page already makes for `FirstRun`. Nothing counts THIS
                shelf on the strip: the subtitle six lines up already says how
                many templates are on it, and a figure drawn twice on one band
                is what `programsTabs` drops it for. */}
            <SubTabs
              label="Template shelves"
              current="mine"
              tabs={templateTabs('mine', { certified: certifiedCount ?? null })}
            />

            {/* NO `.split` HERE ANY MORE. The pane it held was 70% of the
                working area saying one sentence, and the sentence was an
                instruction to do the only thing the rows already afford. */}
            <Shelf
              variant="table"
              templates={templates}
              selectedId={null}
              onNew={() => setCreating(true)}
              now={now}
              search={{ query, onQuery: setQuery }}
            />
          </>
        )}

        {creating && (
          <NewProgram templates={templates} onClose={() => setCreating(false)} />
        )}
      </main>
    </>
  );
}

/**
 * THE SUBTITLE'S SENTENCE, and the arithmetic is deliberately not a sum of the
 * Clients column.
 *
 * `activeAssignedCount` is per blueprint, and one client may be on one program
 * only — but the figure a trainer wants under the word *Programs* is how many
 * PEOPLE are training to something written here, so the clauses are counted
 * separately and neither is derived from the other: people first, then the
 * blueprints reaching none of them.
 *
 * It is a plain string rather than a node because `.ph__sub` is one line of
 * 12.5px prose and every attempt to mark a clause inside it reads as a control.
 */
function shelfLine(templates: ShelfData['templates']): string {
  const people = templates.reduce((n, t) => n + t.activeAssignedCount, 0);
  const idle = templates.filter(t => t.activeAssignedCount === 0).length;

  const first =
    people === 0
      ? `${templates.length} template${templates.length === 1 ? '' : 's'}, none assigned yet`
      : `${templates.length} template${templates.length === 1 ? '' : 's'} · ${people} client${people === 1 ? '' : 's'} training on one`;

  /* Zero is not said — see the call-site's note. And it is not said twice
     either: with nobody on anything the first clause has already said it. */
  return idle > 0 && people > 0 ? `${first} · ${idle} reaching nobody` : first;
}

/**
 * FIRST RUN — and this is the highest-return screen in the section.
 *
 * It used to say *Nothing on the shelf yet* and offer one button: write a
 * program. That asks a trainer to do twenty minutes of work before the product
 * has done any for them, on the first screen they ever open here — and every
 * competitor in the category now ships a pre-built library precisely because
 * that first twenty minutes is where trainers stop.
 *
 * So the primary path is a program that already works, drawn as three real cards
 * a trainer can read and copy. **Write your own stays**, as a labelled control on
 * the same screen and never behind a link: somebody who came to write their own
 * must not have to decline a recommendation first.
 *
 * With no catalogue to offer — the read failed, or nothing is certified yet — it
 * falls back to exactly the screen it replaces, because a headline promising
 * programs above an empty grid is worse than the honest empty state.
 */
function FirstRun({
  recommended,
  certifiedCount,
  onNew,
}: {
  recommended: CertifiedWire[];
  certifiedCount?: number | null;
  onNew: () => void;
}) {
  return (
    <>
      {/* Same pair as the shelf branch. Both actions here are offered again,
          larger and in reading order, inside `.cert__first` below — so on a
          phone they are a 34px row restating what the screen already says. */}
      <PageHeader
        title="Templates"
        sub="What your clients do, written once and assigned many times"
        actions={<><Button variant="secondary" onClick={onNew}>
            <PlusIcon />
            Build from scratch
          </Button>
          {recommended.length > 0 && (
            <Button href="/programs/certified" variant="primary">
              Browse InclineYou templates
            </Button>
          )}</>}
        className="ph--pglist ph--pgshelf"
      />

      <div className="split__r">
        <div className="cert__first">
          {recommended.length === 0 ? (
            <div className="cert__firstm">
              <h2 className="h5">Nothing on the shelf yet</h2>
              <p className="small">
                A workout plan is a blueprint: days, weeks and the exercises in them. You write it once
                and give each client their own copy of it — editing the blueprint afterwards never
                touches anybody who is already training on one.
              </p>
              <Button variant="primary" size="lg" onClick={onNew}>
                <PlusIcon />
                Write your first plan
              </Button>
            </div>
          ) : (
            <>
              <div className="cert__firstm">
                <h2 className="h5">Start from a plan that already works</h2>
                <p className="small">
                  {certifiedCount ?? recommended.length} blueprints written and reviewed by
                  certified trainers. Copy one and it is yours — rename it, swap exercises, change
                  the weeks. Nothing you do to your copy reaches anybody else&rsquo;s.
                </p>
              </div>

              <ul className="cert__grid" role="list">
                {recommended.map(row => (
                  <li key={row.id}>
                    <CertifiedCard row={row} />
                  </li>
                ))}
              </ul>

              <Button href="/programs/certified" variant="secondary" size="lg">
                See all {certifiedCount ?? recommended.length} templates
              </Button>

              <div className="cert__or">or</div>

              <Button variant="secondary" size="lg" onClick={onNew}>
                <PlusIcon />
                Write your own from scratch
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────── the new-program form ── */

/**
 * ONE ROW OF THE *START FROM* LIST — the name, and the line under it.
 *
 * The second line is the whole reason the picker is not a `<select>`, and the
 * three facts on it are the three a trainer actually decides on:
 *
 * · **How often it trains.** Said as *workouts a week* rather than *days*,
 *   because a day on a blueprint is an ordinal SLOT (the first law) and
 *   *3 days a week* invites the reading this section spends four screens
 *   refusing — that the blueprint knows which weekday. A workout is a thing
 *   that happens; a slot is a position in a list.
 * · **How long it runs.** Weeks, because that is how a block is sold.
 * · **How often it has been used**, which is the fact this picker adds and the
 *   shelf row never carried. The two sources count different things and the
 *   wording says so: a trainer's own program has been copied onto CLIENTS, a
 *   certified one has been copied by TRAINERS. One number under one word would
 *   be a lie in one of the two groups, so there are two sentences.
 *
 * `keywords` carries the goal and the description into the search: a trainer
 * hunting for *the fat loss one* should not have to remember that they called
 * it *Six-week reset*.
 */
function choiceOption(c: StartChoice) {
  const workouts = `${c.days} workout${c.days === 1 ? '' : 's'} a week`;
  const weeks = `${c.weeks} week${c.weeks === 1 ? '' : 's'}`;
  const used =
    c.source === 'own'
      ? c.used === 0
        ? 'not used yet'
        : `used ${c.used} time${c.used === 1 ? '' : 's'}`
      : c.used === 0
        ? 'nobody has used it yet'
        : `${c.used} trainer${c.used === 1 ? '' : 's'} use it`;

  return {
    value: `${c.source}:${c.id}`,
    label: c.name,
    meta: `${workouts} · ${weeks} · ${used}`,
    keywords: `${c.goal ?? ''} ${c.description ?? ''}`,
  };
}

/**
 * Five answers, three of them the shape, and two of them optional — or one
 * answer, when the trainer starts from a blueprint that already exists.
 *
 * The day count and the week count are asked HERE rather than left to the
 * builder's toolbar because they are the first thing a trainer knows about a
 * block — "a four-week, three-day upper/lower" is how one is described out loud
 * — and because a template created with neither writes NULL to both columns,
 * which is the state the day list has to be guessed back from.
 *
 * ── START FROM, AND WHY IT IS THE FIRST CONTROL ─────────────────────────────
 *
 * The most-used action on this whole section is *Duplicate* — trainers build
 * one good program and tweak it — and the certified catalogue exists because
 * the first twenty minutes of writing one from nothing is where trainers stop.
 * Both of those were reachable only from a row of a list the trainer had
 * already left by the time they pressed *New program*. So the question *do you
 * want to start from one of these* is asked before the name, which is the
 * order the decision is actually made in: what am I making, then what is it
 * called.
 *
 * **Choosing one takes the shape with it.** The copy arrives with its
 * exercises already laid out on its own days, so the day and week controls
 * stand down and the dialog reads out what is coming instead —
 * `createFromTemplate`'s own note carries the argument, and the builder is
 * where a shape is changed, because that is where the rows are.
 *
 * ── WHY IT LOOKS LIKE A SHELF ROW AT THE BOTTOM ─────────────────────────────
 *
 * Everything this dialog asks for is drawn on ONE row of the shelf — the name,
 * the day count, the goal, the seven-cell shape and `N wk` — and the shelf is
 * the screen the trainer is standing on when they press *New program*. So the
 * foot of the form is that row, live: the name as they type it, the cells
 * filling as they press a day count, `Nobody on this yet` where the count will
 * be. It is the one place in the product where a form can show the thing it is
 * about before it exists, and it costs nothing but the classes the row already
 * has.
 *
 * ── THE DAY COUNT IS CHIPS AND THE WEEK COUNT IS A FIELD ────────────────────
 *
 * Not a symmetry worth having. `1…7` is the whole of the answer space, closed,
 * and worth seeing at once: recognition rather than recall, one press rather
 * than open-read-choose-close. The weeks are 1 to 52, and a chip row of the
 * four common answers with an *Other* behind them made a trainer running a
 * fourteen-week peak press twice to say a number they already knew.
 */
function NewProgram({
  templates,
  onClose,
}: {
  /** The trainer's own shelf, for the *Start from* list. Already in the
   *  browser — the screen is holding it to draw the list behind this dialog,
   *  and a second read of it is a second answer to one question. */
  templates: ShelfData['templates'];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState<string>('');
  const [days, setDays] = useState(3);
  const [weeks, setWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show } = useToast();

  /* ── start from ──
     `''` is *an empty program*, which is the default and is not a template
     that happens to be empty — it is the absence of one, and the two write to
     different endpoints. */
  const [fromId, setFromId] = useState('');
  /* Lifted out of the picker so `ModalHost` can stand its Escape down while
     the list is up — one press, one rung, the ladder `PhoneProgram` draws. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<StartChoice[]>([]);
  /* WHAT THE LAST SELECTION PUT IN THE THREE TEXT FIELDS, so switching
     templates replaces what a template wrote and never what the trainer
     typed. Without it, picking a second template silently discards a
     description somebody was half-way through. */
  const [seed, setSeed] = useState({ name: '', description: '', goal: '' });

  const own: StartChoice[] = templates.map(t => ({
    id: t.id,
    source: 'own' as const,
    name: t.name,
    goal: t.goal,
    description: t.description,
    weeks: t.weeks ?? 1,
    days: t.trainingDays.length,
    exercises: t.exercises.length || t.exerciseCount,
    /* LIFETIME, not `activeAssignedCount`. The shelf row draws the active
       figure because it is deciding whether an edit is safe; this list is
       deciding which blueprint to reach for, and a program four clients
       finished last winter is one a trainer reaches for. */
    used: t.assignedCount,
  }));

  useEffect(() => {
    /* ON OPEN, ONCE. The catalogue is forty rows the shelf behind this dialog
       never asked for, and most visits to `/programs` never open this. A
       refusal is not drawn: the group is simply absent and the trainer starts
       from an empty program, which is what they came here to do. */
    let live = true;
    void certifiedChoices().then(result => {
      if (live && result.ok) setCatalogue(result.value);
    });
    return () => {
      live = false;
    };
  }, []);

  const choices = [...own, ...catalogue];
  const from = choices.find(c => `${c.source}:${c.id}` === fromId) ?? null;

  function chooseFrom(value: string) {
    const next = choices.find(c => `${c.source}:${c.id}` === value) ?? null;
    setFromId(value);
    /* Empty, or exactly what the last selection wrote: replace. Anything else
       is the trainer's and is kept. */
    setName(v => (!v.trim() || v === seed.name ? next?.name ?? '' : v));
    setDescription(v => (!v.trim() || v === seed.description ? next?.description ?? '' : v));
    setGoal(v => (!v || v === seed.goal ? next?.goal ?? '' : v));
    setSeed({
      name: next?.name ?? '',
      description: next?.description ?? '',
      goal: next?.goal ?? '',
    });
    if (next) setNameError(null);
  }

  /* THE PRIMARY IS NEVER GREYED OUT, and that is the setup flow's call rather
     than `SaveRow`'s. `SaveRow` draws no button at all when nothing is dirty,
     because a profile tab with no edits has nothing to say; here the trainer
     has opened a dialog in order to press this button, and a control that
     cannot be pressed cannot tell them why. Pressing it with no name is how
     they find out — the answer lands on the FIELD, which is where the fix is,
     rather than in a toast (a toast never carries a field error). */
  const [nameError, setNameError] = useState<string | null>(null);

  /* Escape, the focus trap, the focus return and the scrim's click are
     `ModalHost`'s — this screen used to carry its own `keydown` listener and
     its own scrim, which is the three-copies-of-a-behaviour this component
     exists to end. */

  async function submit() {
    if (busy) return;
    if (!name.trim()) {
      setNameError('Give this program a name.');
      document.getElementById('np-name')?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const result = from
      ? await createFromTemplate({
          source: from.source,
          templateId: from.id,
          name,
          goal: goal || null,
          description: description || null,
        })
      : await createTemplate({
          name,
          goal: goal || null,
          description: description || null,
          weeks,
          trainingDays: Array.from({ length: days }, (_, i) => i + 1),
          dayLabels: Object.fromEntries(
            Array.from({ length: days }, (_, i) => [String(i + 1), '']),
          ),
        });
    setBusy(false);
    if (result.ok) {
      /* The dialog closes on the navigation and the shelf row it made is off
         to the left of a screen the trainer is not looking at — they are in
         the builder, on an empty board. The card is what says the row exists.
         Copied from something, the board is NOT empty, and the card says the
         other half instead: what came with it, and that the original is
         untouched. */
      show({
        tone: 'ok',
        title: <>{result.value.name} created</>,
        body: from ? (
          <>
            A copy of {from.name}, with its {from.exercises} exercise
            {from.exercises === 1 ? '' : 's'}. The original is untouched.
          </>
        ) : (
          <>It is on your shelf. Nobody is on it yet.</>
        ),
      });
      router.push(`/programs/${result.value.id}`);
    } else setError(result.message);
  }

  /* THE FIVE CHIPS, PLUS WHATEVER IS ACTUALLY SET. `goal` is free text on the
     wire and the five labels are this screen's shorthand for it — the seeded
     catalogue alone holds *General fitness* and *Post-injury return*, neither
     of which is one of them. Drawn as five fixed chips, a template's own goal
     came across, sat in the payload, and showed as NOTHING pressed: a value
     the trainer could neither see nor clear, which is the failure the profile
     pickers record ("a picker draws every id it was GIVEN, not every id it
     knows") and the schedule's `lengthChoices` answers the same way — the
     stored value becomes a chip of its own. */
  const goalChips = [
    ...GOALS.map(g => g.label),
    ...(goal && !GOALS.some(g => g.label === goal) ? [goal] : []),
  ];

  const shownDays = from ? from.days : days;
  const shownWeeks = from ? from.weeks : weeks;

  return (
    <ModalHost
      /* A dialog mid-write is not one a stray click on the scrim may take
         away: the press has already left, and there is nothing to close back
         to until the server answers. */
      onClose={() => {
        if (!busy) onClose();
      }}
      /* The whole frame, not `.main`. This modal claims the app is inert and
         the rail is part of the app. */
      cover="frame"
      /* Not the ✕, which is the first focusable thing in the head. */
      initialFocus="#np-name"
      covered={pickerOpen}
    >
      <div className="pg__dialog" role="dialog" aria-modal="true" aria-label="New template">
        <DockPanel.Head
          className="pg__newhd"
          title="New template"
          sub="A blueprint. Every client gets their own copy."
          actions={
            <Button
              variant="ghost"
              iconOnly
              label="Close"
              onClick={onClose}
              disabled={busy}
              title={undefined}
              icon={<CloseIcon />}
            />
          }
        />

        <DockPanel.Body className="pg__newbody">
          {/* THE PICKER IS A `SearchSelect` AND NOT A `Select`, and the three
              reasons are the three things a native `<option>` cannot carry: a
              search box, a second line, and a heading that is not itself
              pickable. The second line is the deciding information — how often
              a blueprint trains and how often it has been reached for — and on
              a `<select>` it was a dash-joined tail of the name that a browser
              truncates wherever it likes. */}
          <SearchSelect
            label="Start from"
            searchLabel="Search your programs and templates"
            noun="programs"
            placeholder="An empty template"
            value={fromId}
            onChange={chooseFrom}
            /* THE POPUP OWNS ESCAPE WHILE IT IS UP. Without this the press
               that shuts the list closes the dialog around it and takes the
               half-filled form with it — `ModalHost`'s `covered` carries the
               argument. */
            onOpenChange={setPickerOpen}
            options={[
              {
                value: '',
                label: 'An empty program',
                meta: 'Days and weeks are yours to set. Nothing in it yet.',
                keywords: 'empty blank scratch new nothing',
              },
            ]}
            groups={[
              { label: 'Your programs', options: own.map(choiceOption) },
              { label: 'InclineYou templates', options: catalogue.map(choiceOption) },
            ]}
            hint={
              from
                ? `A copy, yours to edit. Nothing you do to it reaches ${
                    from.source === 'own' ? 'the original' : 'anybody else'
                  }.`
                : undefined
            }
          />

          <TextField
            id="np-name"
            label="Name"
            value={name}
            placeholder="Push / Pull / Legs · 3 day"
            autoComplete="off"
            error={nameError}
            onChange={e => {
              setName(e.target.value);
              /* Re-validated on change once it has refused — the form rule is
                 never to validate the first entry on every keystroke, and
                 always to clear a refusal the moment it stops being true. */
              if (nameError) setNameError(null);
            }}
            onKeyDown={e => {
              /* Enter commits from the one field where a trainer expects it to. */
              if (e.key === 'Enter') void submit();
            }}
          />

          <Textarea
            label={
              <>
                Description <span className="fld__opt">optional</span>
              </>
            }
            value={description}
            rows={2}
            placeholder="Two upper days and one lower, for somebody training around a desk."
            onChange={e => setDescription(e.target.value)}
          />

          {/* THE COPY IS SHORT ON PURPOSE, and it was not on the first pass:
              every field carried a two-line hint and the dialog stood 760px
              tall on a 900px screen — capped, scrolling, with the row it
              writes below the fold. The preview at the foot says what the
              description and the goal are FOR better than a sentence about
              them does, and a name needs no gloss at all. What survives is
              the one fact a trainer cannot see from the form: a day is a slot. */}
          <FormGroup
            heading={
              <>
                Goal <span className="fld__opt">optional</span>
              </>
            }
          >
            <div className="tools">
              {goalChips.map(label => (
                <Chip
                  pressed={goal === label}
                  key={label}
                  onClick={() => setGoal(goal === label ? '' : label)}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </FormGroup>

          {from ? (
            /* THE SHAPE IS THE BLUEPRINT'S AND IT IS READ OUT, NOT ASKED.
               Drawn as facts rather than as disabled controls: a greyed-out
               chip row is a control a trainer tries to press and then has to
               work out why they cannot. */
            <div className="pg__newfrom">
              <span className="fld__l">Shape</span>
              <p className="pg__newfromm">
                <b>
                  {from.weeks} week{from.weeks === 1 ? '' : 's'}
                </b>{' '}
                ·{' '}
                <b>
                  {from.days} day{from.days === 1 ? '' : 's'} a week
                </b>{' '}
                ·{' '}
                <b>
                  {from.exercises} exercise{from.exercises === 1 ? '' : 's'}
                </b>{' '}
                already laid out
              </p>
              <span className="fld__h">
                Change the days, the weeks and every row of it in the builder,
                where you can see what you are moving.
              </span>
            </div>
          ) : (
            <div className="pg__newshape">
              <div className="pg__newpick">
                <span className="fld__l" id="np-days-l">
                  Days a week
                </span>
                <div className="tools" role="group" aria-labelledby="np-days-l">
                  {[1, 2, 3, 4, 5, 6, 7].map(n => (
                    <Chip
                      key={n}
                      className="pg__newnum"
                      pressed={days === n}
                      aria-label={`${n} day${n === 1 ? '' : 's'} a week`}
                      onClick={() => setDays(n)}
                    >
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>

              <TextField
                id="np-weeks"
                label="Weeks"
                className="pg__newweeks"
                type="number"
                min={1}
                max={52}
                numeric
                value={weeks}
                onChange={e => {
                  /* Clamped on the way in, because 0 and 400 are both a week
                     count the builder cannot draw. An empty box reads as 1
                     rather than as NaN — the one state a number input has that
                     a chip row did not. */
                  const n = Number(e.target.value);
                  setWeeks(Math.max(1, Math.min(52, Number.isFinite(n) ? n : 1)));
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') void submit();
                }}
              />

              <span className="fld__h">
                Days are <b>slots</b>, not weekdays — you pair them with the
                client&rsquo;s own week when you assign it.
              </span>
            </div>
          )}

          {/* THE ROW IT WILL BE. Same three facts and the same two right-hand
              marks as `Shelf`'s own row, in the same order — see this
              function's header. `aria-hidden` on the cells alone: the strip is
              a picture of the day count the chips above already say, and the
              sentence beside it is not. */}
          <div className="pg__newprev">
            <span className="pg__newprevk">On your shelf</span>
            <div className="pg__newprevrow">
              <span className="pg__newprevm">
                <b>{name.trim() || 'Untitled program'}</b>
                <span>
                  Nobody on this yet · {shownDays} day{shownDays === 1 ? '' : 's'} a week
                  {goal ? ` · ${goal}` : description.trim() ? ` · ${description.trim()}` : ''}
                </span>
              </span>
              <span className="pg__newprevr">
                <span className="shape" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6, 7].map(slot => (
                    <i
                      key={slot}
                      className={slot <= shownDays ? 'shape__c shape__c--1' : 'shape__c'}
                    />
                  ))}
                </span>
                <span className="pg__newprevn">{shownWeeks} wk</span>
              </span>
            </div>
          </div>

          {error && (
            <Message tone="err" alert>
              {error}
            </Message>
          )}
        </DockPanel.Body>

        <DockPanel.Foot>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy
              ? from
                ? 'Copying…'
                : 'Creating…'
              : from
                ? 'Copy and start building'
                : 'Create and start building'}
          </Button>
        </DockPanel.Foot>
      </div>
    </ModalHost>
  );
}
