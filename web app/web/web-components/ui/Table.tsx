import type { ComponentPropsWithRef, CSSProperties, MouseEvent, ReactNode } from 'react';

/**
 * Data table — rows you compare, sort and select in bulk.
 *
 * The boundary with `ListRow`: a table is for <b>comparing</b> — the eye runs
 * down a column of figures. A list row is for <b>finding</b> — the eye runs down
 * a column of names. A table with one meaningful column is a list wearing
 * borders.
 *
 * ── WHAT THIS COMPONENT ADDS TO A <table> ───────────────────────────────────
 *
 * `aria-sort` on the right header and nowhere else. The reference puts it on the
 * sorted column correctly, but it is one attribute on one of nine headers and it
 * is the first thing lost when a column is added — computing it from the current
 * sort makes that impossible.
 *
 * `scope` on every header, which the reference omits. Without it a reader
 * cannot say which column a cell belongs to, and a nine-column roster read cell
 * by cell is unusable.
 *
 * And a `caption`, visually hidden. A table with no caption is announced as
 * "table, 9 columns, 23 rows" with no idea what of.
 */
export type Column = {
  key: string;
  label: ReactNode;
  /** Right-aligned, tabular. For anything a trainer compares down the column. */
  numeric?: boolean;
  /**
   * No label and no sort: a selection column, an actions column, a chevron.
   *
   * ── IT USED TO ALSO MEAN 38 PIXELS, AND THAT WAS TWO THINGS IN ONE FLAG ────
   *
   * It emitted `sel`, which §11 defines as `width:38px;padding-left:14px` — the
   * width of a CHECKBOX. Right for the column it was named after and wrong for
   * every other column that has no header, which is what the doc line said it
   * covered.
   *
   * It cost the roster its whole column model. That table is `table-layout:
   * fixed` with the action column deliberately left `auto`, so the band's
   * surplus falls into it and the void between a client's problem and their
   * status closes. `bare` gave the action column a width, which meant EVERY
   * column had one — and a fixed table whose tracks all have widths
   * distributes the surplus proportionally across them instead. Measured: the
   * stated 230/348/96 came out as 292/442/122, the void was back at 328px, and
   * nothing in `tsc`, `eslint` or the stylesheet had anything to say about it.
   *
   * So the flag means what it says and the 38px comes from asking for it:
   * `{ key: 'sel', bare: true, className: 'sel' }`. The two call-sites that
   * wanted the old behaviour pass it and are byte-identical.
   */
  bare?: boolean;
  /**
   * The column's own class, for the same reason `Cell` has one: sixteen header
   * cells in the product carry something beyond `num` — `tbl-col--hide-mobile`
   * on a column that folds away at 620px, `n` on a narrow index, `rptcol` on
   * the pair that collapse into the client cell. A header a screen can hide is
   * part of the table's layout, not a style at a call-site.
   */
  className?: string;
};

export function Table({
  caption,
  columns,
  sort,
  children,
  foot,
  className,
  style,
}: {
  /** What the rows are. Hidden, but announced: "22 clients, sorted by name". */
  caption: string;
  /**
   * Optional, because nine of the product's tables have no `<thead>` at all.
   *
   * A session list or a measurement log is read row by row, not compared down
   * a column, and giving those a header row would be inventing one. The
   * caption still says what the table is, which is the part a reader needs.
   */
  columns?: Column[];
  sort?: { key: string; direction: 'ascending' | 'descending' };
  children: ReactNode;
  /**
   * A `<tfoot>` — the total row, or a note spanning the columns.
   *
   * Added because the catalogue did not cover it and **ten call-sites had each
   * answered that by abandoning this component**: `OwedTab`, `LedgerTab`,
   * `GymShareTab`, `WriteOffsTab`, `Team` and the rest all hand-write a raw
   * `<table className="tbl">` with a `<thead>`, a `<tbody>` and a `<tfoot>`,
   * because `children` went straight into the body and there was nowhere else
   * to put a total. §11 has styled `.tbl tfoot td` — 44px, a
   * `--tx-line-strong` top rule and the `--tx-surface-2` fill — from the
   * beginning, so the design system had the picture and the component had no
   * prop for it.
   *
   * `Row`s go in here, the same as in `children`. A total is a row.
   */
  foot?: ReactNode;
  className?: string;
  /**
   * `.tbl` is `font-size: 13.5px` and nothing else — no width, no
   * border-collapse. So `width: '100%'` was hardcoded here and six tables that
   * also set `borderCollapse: 'collapse'` could not say so. It is a prop now,
   * defaulting to the width the hardcoded value gave.
   */
  style?: CSSProperties;
}) {
  return (
    <table
      className={['tbl', className].filter(Boolean).join(' ')}
      style={style ?? { width: '100%' }}
    >
      <caption className="vh">{caption}</caption>
      {columns ? (
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={[c.numeric ? 'num' : null, c.className].filter(Boolean).join(' ') || undefined}
                aria-sort={sort?.key === c.key ? sort.direction : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>{children}</tbody>
      {foot ? <tfoot>{foot}</tfoot> : null}
    </table>
  );
}

/**
 * One cell.
 *
 * `className`, `style` and `colSpan` are here because a `<td>` has them and
 * the product's tables use them: twenty-two tables put a class on a cell
 * (`mono` for a figure, `strong` for a total, `wrap` for a note), seventeen set
 * a width or a colour, nine span columns for an empty state or a footer. This
 * is not the prop soup a Card would grow from the same list — a table's cells
 * genuinely differ from one another, and that is what a table is.
 */
export type Cell = {
  key: string;
  content: ReactNode;
  numeric?: boolean;
  className?: string;
  style?: CSSProperties;
  colSpan?: number;
  /**
   * A click handler on the CELL, which in practice is always the same
   * handler: `(e) => e.stopPropagation()`.
   *
   * ── WHY A `<td>` NEEDS ONE, WHEN `Row` ALREADY RIDES EVERY `<tr>` PROP ─────
   *
   * Because the two are opposites. `Row` takes an `onClick` so the whole line
   * can be the control — the roster and the sessions table both make each row a
   * `role="link"` — and the moment it does, every button INSIDE the row is a
   * target inside a target. Pressing *Remind* navigates to the client's file
   * and the message is never drafted.
   *
   * The guard has to sit on the cell and not on the button: the action column
   * is a 350px track with a 90px button ranged right in it, so most of what a
   * trainer can hit in that column is cell, and a bare cell click would
   * navigate. Both call-sites that had this wrote
   * `<td onClick={e => e.stopPropagation()}>` by hand, which is exactly the
   * markup this component exists to stop being written twice.
   *
   * It is typed as the DOM handler rather than as a `stopNavigation` boolean
   * because a cell that wants to do something else with a press — a checkbox
   * column, a cell-level menu — should not have to leave the component to do
   * it.
   */
  onClick?: (e: MouseEvent<HTMLTableCellElement>) => void;
  /**
   * The column's name, carried into the cell as `data-l` for a phone reflow.
   *
   * A table that reflows to one block per row loses its `<thead>`, and app.css
   * has twice answered that by printing `attr(data-l)` as a `::before` on each
   * cell — the price table and the console's set grid, which writes the
   * attribute by hand on a raw `<td>` because this component had no prop for
   * it. A table with a header row and a narrow rung needs both, so it is a prop
   * rather than a third hand-written `<td>`.
   *
   * An empty string is meaningful: `data-l=""` is how those sheets mark the
   * cell that IS the row and therefore takes no label.
   */
  label?: string;
};

/**
 * A row. `header` is the cell that names it — the client, the exercise — and it
 * becomes a `<th scope="row">`, so a reader reading the Pending column says
 * "Priya Pillai, ₹9,000" rather than "₹9,000".
 *
 * The rest of a `<tr>`'s props ride through, because a row is sometimes the
 * control: the sessions table makes each one a `role="link"` with an `onClick`,
 * an `onKeyDown` and an `aria-label`, and a component that swallowed those
 * would make the table unusable rather than tidier.
 */
export function Row({
  select,
  header,
  cells,
  selected,
  className,
  ...rest
}: {
  select?: ReactNode;
  /**
   * The cell that names the row, rendered `<th scope="row">`.
   *
   * Optional: a table with no header column has no cell that names its rows,
   * and promoting an arbitrary first cell to a `<th>` would tell a reader
   * something untrue.
   */
  header?: ReactNode;
  cells: Cell[];
  selected?: boolean;
  className?: string;
} & Omit<ComponentPropsWithRef<'tr'>, 'className' | 'children'>) {
  return (
    <tr aria-selected={selected} className={className} {...rest}>
      {select ? <td className="sel">{select}</td> : null}
      {/* §04 now styles `tbody th` — left, 500, full-strength ink. */}
      {header !== undefined ? <th scope="row">{header}</th> : null}
      {cells.map((c) => (
        <td
          key={c.key}
          className={[c.numeric ? 'num' : null, c.className].filter(Boolean).join(' ') || undefined}
          style={c.style}
          colSpan={c.colSpan}
          onClick={c.onClick}
          data-l={c.label}
        >
          {c.content}
        </td>
      ))}
    </tr>
  );
}

/**
 * A HEADING INSIDE THE BODY — the month a run of rows belongs to.
 *
 * A long chronological table has one fact that repeats and one that does not,
 * and `c-dayrule` is the design system's answer to that: the repeated fact
 * comes out of the rows and becomes the band they sit under. It is a `<div>`,
 * and a `<div>` may not be a child of `<tbody>` — so this is the carrier, and
 * whatever the caller puts in it is the content. Usually a `DayRule`.
 *
 * ── `span` IS REQUIRED, AND IT IS NOT A CONVENIENCE ─────────────────────────
 *
 * A `colspan` wider than the number of columns that actually exist does not
 * clamp. The browser INVENTS the difference out of the table's own width, and
 * on `table-layout:fixed` that silently rewrites every track — measured on the
 * roster at a narrow band: cells summing to 692 inside an 813px table, an
 * action column taking 40px against the 161 it was owed, and a button painted
 * over its neighbour. `.main` is `overflow:hidden`, so no document-level
 * overflow probe reports any of it.
 *
 * So the span is the caller's to state, it must equal the number of columns
 * VISIBLE at the width being drawn, and a screen that hides a column at a
 * breakpoint has to change it there too.
 */
export function GroupRow({
  span,
  children,
  className,
}: {
  /** Exactly the number of visible columns. See above — this is load-bearing. */
  span: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={['tbl__grp', className].filter(Boolean).join(' ')}>
      {/* `<td>` and not `<th scope="rowgroup">`: the band is a division of one
          list, not a header for a set of rows a reader would want announced
          before every cell under it. The text inside is read in document order
          where it sits, which is what a rule is. */}
      <td className="tbl__grp-c" colSpan={span}>
        {children}
      </td>
    </tr>
  );
}

/** The bordered surface a table sits on. The table itself has no border. */
export function TableFrame({ children, width }: { children: ReactNode; width?: number | string }) {
  return (
    <div
      style={{
        width,
        border: '1px solid var(--tx-line)',
        borderRadius: 'var(--tx-r3)',
        overflow: 'hidden',
        background: 'var(--tx-surface)',
      }}
    >
      {children}
    </div>
  );
}
