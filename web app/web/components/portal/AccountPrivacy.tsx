import { TRAINER_KEEPS_NOTES, canSee, cannotSee } from '@/lib/portal/visibility';
import { formatPhone } from '@/lib/auth/policy';
import type { MeWire } from '@/lib/portal/api';
import { Card, CardBody, CardHead } from '@/web-components/ui/Card';
import { Message } from '@/web-components/ui/Message';

import { DataRights } from './DataRights';

/**
 * §5 · Privacy — the trust screen, and all five DPDP rights.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS THE PRODUCT'S DIFFERENTIATOR AND IT USED TO START ON SCREEN FOUR
 *
 * The spec calls the visibility list *"the one most products skip, and the one
 * that builds trust fastest"*, and **none of ABC Trainerize, TrueCoach or
 * Everfit ships anything comparable** — read from each product's own help
 * centre, not from reviews. It is this portal's clearest advantage over the
 * three products a trainer might otherwise be using.
 *
 * Measured on the single page it came from, at 390×844: it began at **y=2,215**
 * of 4,075 — the fourth screen — and the flow that cannot be undone began on the
 * sixth. So the strongest thing on the destination was the least likely to be
 * read, and the split is what fixes that: this tab opens on it.
 *
 * ── EVERY ROW IS DERIVED, WHICH IS WHAT KEEPS IT FROM BECOMING A LIE ────────
 *
 * `lib/portal/visibility.ts` carries the full argument. The short form: this is
 * the only screen in the portal whose content is a claim about the SOFTWARE
 * rather than about the client, so a feature shipped next month can falsify a
 * row without anybody editing this file. Each row therefore names the tables and
 * routes it is a promise about, in a `sources` field that is **not rendered** —
 * it exists so somebody adding a reader for `assessment` finds this file by
 * grepping the table name, where they would never find a paragraph of prose.
 *
 * The `no` half is second, deliberately: a client who reads the first list and
 * stops has read the honest half.
 */
export function AccountPrivacy({ me }: { me: MeWire }) {
  const first = me.trainer.name.split(' ')[0];

  return (
    <div className="portal col gap4">
      {/* ── §5 · what my trainer can see ─────────────────────────────────

          ── THE BOUNDARY WAS A ROW, AND IT IS THE POINT OF THE SCREEN ───────

          Both lists used to live in ONE card, with *What {first} cannot see*
          drawn as a `CardBody` between them carrying an `<h3>` — the same
          element, the same type and the same 13px padding as the twelve items
          either side of it. So the single most important distinction on the
          product's stated differentiator was rendered at the weight of the
          things it was distinguishing, 800px into a card.

          MEASURED at 390px: that card stood **1,319px** in a 620px window, with
          the boundary at y≈800 — the third screen of a two-card, **2,646px**
          destination. A client scrolling it had no way to know which half they
          were in without scrolling back to find a heading that looked like a row.

          Two cards. The boundary becomes a `CardHead`, which is the strongest
          hierarchy this design system has and the one a reader already scans
          for, and it costs one card head. It also means a client who reads the
          first card and stops has read the honest half and KNOWS they have —
          which is the property the single-card version was reaching for by
          putting `no` second, and could not deliver. */}
      <Card>
        <CardHead title={`What ${first} can see`} />
        <CardBody>
          <p className="small">
            All of it comes from what you and {first} put in. Nothing here is
            collected in the background.
          </p>
        </CardBody>
        {/* One `CardBody` per row rather than a table, for the reason the notes
            card carries: these are SENTENCES, and a `.tbl` cell does not wrap
            them, it widens — 688px and 820px in a 350px card at 390px wide.
            They are also meant to be read rather than scanned, which is a list
            and not a grid.

            Every row title is an `<h3>`. They were `<p className="h5">`, and
            counted out of the rendered HTML this destination had **7 real
            headings against 18 elements carrying a heading's type styles**. `.h5`
            is `font-size:13px;font-weight:700` and nothing else, and
            `webapp.css`'s reset zeroes heading margins, so the element swap is
            invisible and it is the cheapest accessibility win on the screen.
            WCAG 1.3.1. */}
        {canSee(first).map((row) => (
          <CardBody key={row.what} divided>
            <h3 className="h5">{row.what}</h3>
            <p className="small mt2">{row.why}</p>
          </CardBody>
        ))}
      </Card>

      {/* ── §5 · and the half that is a claim about the SOFTWARE ─────────────

          ── EVERY ROW IS DERIVED, WHICH IS WHAT KEEPS IT FROM BECOMING A LIE ─

          `lib/portal/visibility.ts` carries the full argument. The short form:
          this is the only screen in the portal whose content is a claim about the
          SOFTWARE rather than about the client, so a feature shipped next month
          can falsify a row without anybody editing this file. Each row therefore
          names the tables and routes it is a promise about, in a `sources` field
          that is **not rendered** — it exists so somebody adding a reader for
          `assessment` finds this file by grepping the table name, where they
          would never find a paragraph of prose. */}
      <Card>
        <CardHead title={`What ${first} cannot see`} />
        {cannotSee(first).map((row, i) => (
          <CardBody key={row.what} divided={i > 0}>
            <h3 className="h5">{row.what}</h3>
            <p className="small mt2">{row.why}</p>
          </CardBody>
        ))}
        <CardBody divided>
          {/* The one row on this screen that is about the TRAINER's privacy.
              `visibility.ts` carries why a client is owed it: they will assume
              the answer is symmetrical, and it is not. */}
          <Message tone="warn">{TRAINER_KEEPS_NOTES}</Message>
        </CardBody>
      </Card>

      {/* ── §5 · download, complain, nominate, delete ───────────────────────

          Four rights in one card, and §13's grievance route and §14's nominee
          are the two that were missing. `DataRights` carries the table. */}
      <DataRights
        clientName={me.client.name}
        phone={me.client.phone}
        /* `formatPhone` in policy.ts takes a string and always returns one —
           handed '' it answers a bare `+91 `, which is the blank line
           `AccountMenu`'s header already learned to drop. The absence is
           decided here, before the formatter sees it. */
        phonePretty={me.client.phone ? formatPhone(me.client.phone) : null}
        trainerFirstName={first}
        rosterCount={me.rosters.length}
        nominee={me.prefs.nominee}
      />
    </div>
  );
}
