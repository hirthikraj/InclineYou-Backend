import Link from 'next/link';
import type { ReactNode } from 'react';

import { Avatar, AvatarStack, type StackedPerson } from './Avatar';
import { CheckboxCell } from './Checkbox';

/**
 * Program row — eight columns at desk width, two declared lines below 900px.
 *
 * ── WHY IT IS NOT `Table` ───────────────────────────────────────────────────
 *
 * `ui/Table.tsx` emits a real `<table class="tbl">`. This cannot: the whole row
 * is a link to the program it names, and an anchor may not wrap a `<tr>`. So it
 * is a CSS grid that reads as a table above 900px and stops pretending below
 * it — a different component with a different accessibility story, rather than
 * a variant of the data table.
 *
 * ── WHAT IT DECIDES ─────────────────────────────────────────────────────────
 *
 * · THE NOUN EACH FIGURE IS OF, and that it is CLIPPED rather than
 *   `display:none`. Two things follow and both are the point: the header row is
 *   safe to mark `aria-hidden`, because a reader hears *4 days a week* off the
 *   row itself and never has to associate a figure with a header it met six
 *   rows ago; and the reflow un-clips nouns that are already in the markup
 *   instead of inventing them. Clipped and not `.vh`, whose `!important` a
 *   media query cannot undo.
 * · ZERO IS A DASH AND A SENTENCE. `0 clients` in a column of figures reads as
 *   a measurement; *— nobody on this yet* is what a trainer scanning for a
 *   program they can edit without reaching anybody is actually looking for.
 * · THE CLIENTS COLUMN IS FACES AT DESK WIDTH AND A FIGURE BELOW 900px, and
 *   both are always in the markup. *Is anybody on this, and is it anybody I am
 *   thinking about* is a question about presence, and a column of `13 clients
 *   on this` / `1 client on this` answers it by making the trainer read three
 *   numbers. A cluster answers it without being read. Under 900px the row is
 *   two lines of 12px prose where a 24px disc would be furniture, so the stack
 *   stands down and the figure — clipped up there — comes back. The exact
 *   count never leaves: `AvatarStack` is `aria-hidden` and the noun beside it
 *   is what a screen reader gets at every width.
 * · AND THE FIGURE IS THE FALLBACK, not just the small screen's reading. A wire
 *   that sent no names (an older build, or a backend that has not added the
 *   field) draws the count visibly at desk width rather than an empty cell —
 *   the column degrades to what it used to be instead of to nothing.
 * · THE TWO WRAPPERS, which are `display:contents` at desk width and become
 *   real boxes below it. Without them the reflowed row is five stacked lines
 *   instead of two, because a grid item cannot be `display:inline`.
 * · THE ELEMENT, on `Button`'s rule: `next/link` for anything the router can
 *   serve, a plain anchor for anything off-site.
 * · THE SECOND LINE UNDER THE NAME, and it is what the name track is FOR.
 *   MEASURED at 1536 the track was 700px holding a 194px name, and at 1920 it
 *   was 872 — half of every row was blank canvas between the name and the first
 *   figure, on the screen whose whole job is comparing programs. A blueprint
 *   already knows what it is made of (`dayLabels` — *Upper A · Lower A · Upper
 *   B · Lower B*) and the shelf threw it away. `sub` is that line: it fills the
 *   slack with the program's own content, and it sits directly beside the shape
 *   strip, which is the picture of the same fact. Optional, because the sheet
 *   and the pane have no slack to fill.
 * · THE ACTION CELL, a fixed 36px track at the right edge, on `.wkrow`'s
 *   pattern. It is a SIBLING of the link for `select`'s reason — an anchor may
 *   not contain a button — so it lives in the same positioned wrapper and is
 *   laid over the gutter the row opens on its right. A row whose only verb is
 *   *tick a box, then read the bulk bar* makes the trainer discover a selection
 *   mode to duplicate one program.
 *
 * It does NOT format the stamp. `editedAgo` needs the server's `now` — a
 * relative date computed in the browser is the render-time clock, and this
 * component has no business holding one.
 */
export function ProgramRow({
  name,
  href,
  sub,
  days,
  clients,
  assigned = [],
  client,
  tag,
  weeks,
  goal,
  edited,
  editedLabel = 'edited ',
  certified,
  select,
  actions,
  className,
}: {
  name: string;
  href: string;
  /**
   * WHAT THE PROGRAM IS MADE OF, on the name's second line — the day labels a
   * trainer wrote, in slot order. See the header's own bullet. Left out and the
   * row is the one line it always was; the cell does not reserve the space.
   */
  sub?: string;
  /** The slots this program trains, 1–7. Drawn as a shape AND counted. */
  days: number[];
  /** How many are on it. Authoritative — never `assigned.length`. */
  clients: number;
  /** A capped sample of who, for the faces. See `TemplateWire.assignedClients`. */
  assigned?: StackedPerson[];
  /**
   * WHOSE COPY THIS IS — and it REPLACES the clients column rather than adding
   * an eighth one.
   *
   * The row draws two different records now. A BLUEPRINT is written once and
   * assigned many times, so *how many are on it* is a real column and a
   * changing one — the only cell on the row that moves without anybody editing
   * the program. A client's COPY is one person's by construction: that column
   * would read `1` on every row of the list forever, which is a track of
   * furniture 176px wide.
   *
   * So the same track carries the name instead, which is exactly what it was
   * sized for — `.ptrow`'s own note says 176 is *five overlapped discs plus a
   * 14-character name*, and the one-client case was already an avatar beside a
   * name. Nothing about the grid changes; `ProgramRowHead` flips the one word
   * over it, which is what keeps the two in step.
   *
   * The name is REAL TEXT and not `AvatarStack`'s — that component is
   * `aria-hidden` whole, on the grounds that the count beside it is what a
   * reader gets. Here there is no count: the person IS the cell, and a row
   * announcing *Push/Pull/Legs, 3 days a week* with no name in it is the
   * column missing for everybody who is not looking at it.
   */
  client?: StackedPerson;
  /**
   * A STATE BESIDE THE NAME, where `certified` puts provenance.
   *
   * Typed as a node rather than as a second boolean because what it says is
   * the call-site's: a blueprint's tag is permanent provenance and a copy's is
   * *Ended*, which is a fact about a date. `certified` stays its own prop —
   * it is the one tag this component decides the wording of, because *From
   * templates* must read identically on every shelf that draws it.
   */
  tag?: ReactNode;
  weeks: number;
  goal?: string | null;
  /** Already relative-formatted against the server's clock — see above. */
  edited: string;
  /** The small word before the last column's value. `''` where the value says what it is (*Week 3 of 8*). */
  editedLabel?: string;
  /** Copied from the certified shelf. Provenance, and it is permanent. */
  certified?: boolean;
  /**
   * THE ROW IS PICKABLE, and the box is a SIBLING of the link rather than a
   * child of it.
   *
   * An `<a>` may not contain an interactive control: the checkbox would be
   * unreachable by keyboard inside the link's own tab stop, and a pointer
   * press on it would navigate to the program instead of ticking it. So the
   * anchor and the box sit side by side inside one positioned wrapper, and the
   * box is laid over the gutter the row opens for it. Two tab stops per row —
   * *pick this one* and *open this one* — which is the honest count, because
   * there are two things to do.
   *
   * `label` says WHICH row: twenty-two boxes named *Select* are twenty-two
   * identical controls in a screen reader's list. `CheckboxCell`'s own rule.
   */
  select?: { checked: boolean; onChange: (checked: boolean) => void; label: string };
  /**
   * THE OVERFLOW VERBS, in a track of their own at the right edge. A `RowMenu`
   * in every call-site so far; typed as a node because the cell does not care,
   * and a row with one verb should be allowed to draw one button.
   */
  actions?: ReactNode;
  className?: string;
}) {
  const active = new Set(days);
  const cls = ['ptrow', select ? 'ptrow--pick' : '', actions ? 'ptrow--act' : '', className]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className="ptrow__n">
        <span className="ptrow__nt">
          <span className="ptrow__nm">{name}</span>
          {certified && <span className="tag tag--acc">From templates</span>}
          {tag}
        </span>
        {/* Not `aria-hidden`: it is the only place the day names are said, and
            *Upper A · Lower A* is the answer to *which of my four-day blocks is
            this* that no figure on the row can give. */}
        {sub && <span className="ptrow__sub">{sub}</span>}
      </span>

      {/* The link's accessible name is its text, and the spans ran together (*Day 33 days a week8 weeks*). */}
      <span className="vh">. </span>
      <span
        className="ptrow__sh"
        /* THE STRIP IS NOT SELF-EXPLANATORY AND NEVER WAS. Seven cells with
           three lit is a picture of *which slots of a seven-day pattern*, and a
           trainer reading it as Mon–Sun is reading it wrong — the slots are
           ordinal, which is the same law that gives the builder no Rest column.
           The title says so in words for a pointer; the days column beside it
           carries the figure for a reader. */
        title={`Trains ${days.length} of 7 day slots: ${days.join(', ')}`}
      >
        {/* The strip is a picture of the same number the next column prints, so
            the column carries the accessible text and the strip is hidden.
            Drawn anyway, because *which of these trains four days* is answered
            faster by a shape than by reading five 4s. */}
        <span className="shape" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((slot) => (
            <i key={slot} className={active.has(slot) ? 'shape__c shape__c--1' : 'shape__c'} />
          ))}
        </span>
      </span>

      <span className="ptrow__meta">
        <span className="ptrow__facts">
          <span className="ptrow__f">
            <b>{days.length}</b>
            <span className="ptrow__k"> day{days.length === 1 ? '' : 's'} a week</span>
          </span>

          <span className="ptrow__f">
            <b>{weeks}</b>
            <span className="ptrow__k"> week{weeks === 1 ? '' : 's'}</span>
          </span>

          <span className="ptrow__f ptrow__cl">
            {client ? (
              /* ONE PERSON, NOT A COUNT — see the `client` prop's own note. The
                 disc is `aria-hidden` inside the component already — it is
                 initials off the name beside it, so reading both is reading
                 the same fact twice — and the noun is
                 clipped at desk width like every other on this row, which is
                 what keeps the header safe to hide. */
              <>
                <Avatar id={client.id} name={client.name} size="sm" />
                <span className="ptrow__who">{client.name}</span>
                <span className="ptrow__k"> is on this</span>
              </>
            ) : clients === 0 ? (
              <>
                <b className="ptrow__none">&mdash;</b>
                <span className="ptrow__k"> not used yet</span>
              </>
            ) : (
              <>
                {/* `total` is `clients` and not the sample's length — the whole
                    of `assignedClients`' contract, and the arithmetic behind
                    the overflow disc reading `+38` off six names. */}
                <AvatarStack people={assigned} total={clients} />
                {/* Clipped beside the faces and shown without them, which is
                    the fallback in the header's fourth bullet. It un-clips
                    again under 900px, where the stack is the thing that goes. */}
                <b className={assigned.length > 0 ? 'ptrow__cn' : undefined}>{clients}</b>
                <span className="ptrow__k"> client{clients === 1 ? '' : 's'} on this</span>
              </>
            )}
          </span>
        </span>

        <span className="ptrow__g">{goal ?? ''}</span>

        <span className="ptrow__e">
          {editedLabel && <span className="ptrow__k">{editedLabel}</span>}
          {edited}
        </span>
      </span>
    </>
  );

  const external = /^(?:[a-z]+:)?\/\//i.test(href) || /^(?:mailto|tel):/i.test(href);
  const row = external ? (
    <a className={cls} href={href}>
      {body}
    </a>
  ) : (
    <Link className={cls} href={href}>
      {body}
    </Link>
  );

  if (!select && !actions) return row;

  const wrap = ['ptrow__w', select?.checked ? 'ptrow__w--on' : '', actions ? 'ptrow__w--act' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrap}>
      {select && (
        <span className="ptrow__sel">
          <CheckboxCell
            label={select.label}
            checked={select.checked}
            onChange={(e) => select.onChange(e.currentTarget.checked)}
          />
        </span>
      )}
      {row}
      {/* Over the right gutter, for the same markup reason the checkbox is over
          the left one. `.ptrow--act` is what opens it, so the head can open the
          identical one and keep EDITED over the stamps under it. */}
      {actions && <span className="ptrow__act">{actions}</span>}
    </div>
  );
}

/**
 * The column names, `aria-hidden` because every figure below carries its own
 * noun. Exported beside the row so a caller cannot draw one without the other,
 * or draw them in two different orders.
 *
 * `pickable` opens the SAME left gutter the rows open for their checkbox and
 * puts nothing in it — the select-all lives in the bulk bar, which is the one
 * place it can also say how many are ticked. A head that does not take the
 * gutter is a head whose PROGRAM label sits 28px left of every name under it.
 * `actionable` does the same at the other end for the overflow menu.
 */
export function ProgramRowHead({
  pickable,
  actionable,
  /** The fifth column holds ONE person rather than a count — `ProgramRow`'s
   *  `client` prop. The word is the only thing that changes; the track does
   *  not, which is the point of that prop. */
  client,
  lastHead = 'Edited',
  className,
}: {
  pickable?: boolean;
  actionable?: boolean;
  client?: boolean;
  /** The last column's name — *Progress* on the list of what clients are on. */
  lastHead?: string;
  /** The row's own modifiers (`ptrow--cp`, `ptrow--nog`), so the head's tracks match the rows under it. */
  className?: string;
} = {}) {
  const cls = ['ptrow', 'ptrow--hd', pickable ? 'ptrow--pick' : '', actionable ? 'ptrow--act' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} aria-hidden="true">
      <span>Program</span>
      <span>Shape</span>
      <span>Days</span>
      <span>Weeks</span>
      <span>{client ? 'Client' : 'Clients'}</span>
      <span>Goal</span>
      <span>{lastHead}</span>
    </div>
  );
}
