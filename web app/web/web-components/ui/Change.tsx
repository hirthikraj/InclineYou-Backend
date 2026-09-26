/**
 * Change — *25 kg → 27.5 kg*, with an optional delta clause.
 * Catalogue entry `c-change`, `.chg`.
 *
 * ── IT IS THE WHOLE OF §3 AND IT WAS NOT A COMPONENT ─────────────────────────
 *
 * §3 of the client spec opens with one instruction — **"Show change, not
 * data"** — which makes this the portal's most-repeated shape. Progress drew it
 * four times with nothing underneath it: the summary's two lifts, the summary's
 * two tape sites, each strength card's headline, and the weight card's
 * headline.
 *
 * ── THE TWO SPELLINGS ARE THE REASON IT EXISTS ───────────────────────────────
 *
 * `buildSummary` wrote `${g.from}kg → ${g.to}kg` and `Progress.tsx` wrote
 * `{g.from} kg → {g.to} kg`, so **one change was spelled two ways 300px apart
 * on one screen** — *25kg → 27.5kg* above *25 kg → 27.5 kg*. Neither is wrong,
 * and a reader has no way to know that; one figure in two typographies reads as
 * two figures. That disagreement lived in the STRING, so no amount of CSS could
 * have caught it — which is why `buildSummary` returns the PARTS now and this
 * component is the only thing in the product that formats them.
 *
 * ── WHAT IT REFUSES: A TONE ON THE FIGURE ────────────────────────────────────
 *
 * There is no `direction` and no `good`, and `Stat`'s `delta` — which has both,
 * and argues for them — is the right comparison. That prop is for a trainer's
 * dashboard, where a figure moving is welcome or is not. This is a client
 * reading a number about their own body, and `WEIGHT_HAS_NO_TONE` in
 * `lib/portal/progress.ts` is the rule: down is not good, up is not bad, and a
 * waist growing on somebody putting on muscle is the plan working. The product
 * does not hold the field that would tell the two apart.
 *
 * So the figure is plain ink at every size, and the ACCENT is available only on
 * the separate `delta` clause, which a caller passes only for a strength gain —
 * the one change on this surface that is unambiguous in one direction. §3 says
 * so itself, and `Progress` is the only caller that passes it.
 */
export function Change({
  /**
   * What changed — the movement, or the site on the body. Absent where the
   * card's own head already says it, which is every card headline.
   */
  label,
  from,
  to,
  /**
   * *kg*, *cm* — BARE, never ` kg`.
   *
   * The space between a figure and its unit is the one thing a caller must not
   * decide, and `buildSummary` proved it: it passed `' kg'` for a lift while
   * the tape's own rows carry `'cm'` from the wire, so one array of five lines
   * would have spaced two of them one way and three the other. `.chg__u` owns
   * it now, which means there is nothing left for a caller to get wrong.
   */
  unit,
  /**
   * The delta as its own clause — *up 2.5 kg*. Accent-inked, and see above for
   * why that is sanctioned here and nowhere else in this component.
   */
  delta,
  /**
   * 17px, the default, for a line in a list; 19px for a card's own headline;
   * `xl` for the figure that IS the card.
   *
   * The third one is `--tx-fig-sm` — the design system's own small figure size,
   * the one `.figs__v` draws a stat row at — rather than a number invented for
   * one screen, and it steps 30 → 26px on a narrow viewport with the rest of
   * that scale. It is for the case where the change is not a line ABOUT the
   * card's subject but the subject itself: the check-in's Measurements panel,
   * whose whole content is what one tape did between two dates, with a chart
   * under the figure rather than a figure beside a chart.
   */
  size = 'md',
  className,
}: {
  label?: string;
  /** Null where there is nothing before it — see the note in the figure. */
  from: number | null;
  to: number;
  unit: string;
  delta?: string;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}) {
  return (
    <p className={['chg', size === 'md' ? null : `chg--${size}`, className].filter(Boolean).join(' ')}>
      {label ? <span className="chg__l">{label}</span> : null}
      {/*
        ONE `<span>` HOLDING THE WHOLE FIGURE, AND THE ARROW INSIDE IT.

        The arrow is `aria-hidden` and the accessible reading is supplied as
        text, because a `→` between two numbers is announced as "right arrow" or
        as nothing at all — the same call `HeroCard` makes for its own figure,
        for the same reason. `.vh` rather than an `aria-label` on the span: a
        label would replace the figures too, and then a reader loses the numbers
        to gain the word between them.
      */}
      <span className="chg__v">
        {/*
          A FIRST READING IS NOT A CHANGE, and drawing one as `72.2 → 72.2`
          would be a claim about a movement that was never measured.

          `from` is nullable for that case alone: a client's first check-in, the
          first time a trainer takes a tape to a new site, a lift logged once.
          The assessment screen hand-wrote a `.chg` of its own for exactly this
          and `check-components` caught it, which is the evidence the prop is
          owed — the alternative is every screen with a first reading in it
          writing this paragraph again.
        */}
        {from === null || from === undefined ? null : (
          <>
            {from}
            <span className="chg__u">{unit}</span>
            <span className="chg__a" aria-hidden="true">
              {' → '}
            </span>
            <span className="vh"> to </span>
          </>
        )}
        {to}
        <span className="chg__u">{unit}</span>
      </span>
      {delta ? <span className="chg__d">{delta}</span> : null}
    </p>
  );
}
