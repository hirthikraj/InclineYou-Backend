import type { CSSProperties, ReactNode } from 'react';

/**
 * The state matrix — every variant against every state, in one grid.
 *
 * The reason it is a grid and not a row of examples: a state that has been
 * forgotten shows up as a hole. Nothing else in a component page makes an
 * omission visible.
 */
export function Matrix({
  rowHeader,
  columns,
  rows,
  headWidth = 104,
}: {
  rowHeader: string;
  columns: string[];
  rows: { label: string; cells: ReactNode[] }[];
  headWidth?: number;
}) {
  return (
    <div
      className="mtx"
      style={{ gridTemplateColumns: `${headWidth}px repeat(${columns.length}, minmax(0, 1fr))` }}
    >
      <div className="mtx__h">{rowHeader}</div>
      {columns.map((c) => (
        <div key={c} className="mtx__h">
          {c}
        </div>
      ))}
      {rows.map((r) => (
        <Row key={r.label} label={r.label} cells={r.cells} />
      ))}
    </div>
  );
}

/* A fragment rather than a wrapper: the cells are direct children of the grid,
   and a <div> around each row would break the columns the header just set. */
function Row({ label, cells }: { label: string; cells: ReactNode[] }) {
  return (
    <>
      <div className="mtx__rh">{label}</div>
      {cells.map((c, i) => (
        <div key={i} className="mtx__c">
          {c}
        </div>
      ))}
    </>
  );
}

/**
 * The specification table.
 *
 * `token` is a column of its own rather than a note, because a value with no
 * token behind it is the finding: it means the number was typed at a call-site
 * and the design system cannot move it.
 */
export function SpecTable({
  rows,
}: {
  rows: { property: string; value: ReactNode; token?: string; note?: ReactNode }[];
}) {
  return (
    <table className="st">
      <thead>
        <tr>
          <th>Property</th>
          <th>Value</th>
          <th>Token</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.property}>
            <td>{r.property}</td>
            <td className="v">{r.value}</td>
            <td className="t">{r.token ?? '—'}</td>
            <td>{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A plain rules table — the content column. Yes on the left, no on the right. */
export function RulesTable({ rows }: { rows: { rule: string; yes: ReactNode; no: ReactNode }[] }) {
  return (
    <table className="st">
      <thead>
        <tr>
          <th>Rule</th>
          <th>Yes</th>
          <th>No</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.rule}>
            <td>{r.rule}</td>
            <td>{r.yes}</td>
            <td>{r.no}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Tick = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5 9.5 17 19 7" />
  </svg>
);

const Cross = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * Do and don't, side by side.
 *
 * Both halves render real components, so the "don't" is a thing the product can
 * actually be made to do — not a drawing of a mistake. A rule nobody can commit
 * is not worth printing.
 */
export function DoDont({
  yes,
  no,
}: {
  yes: { figure: ReactNode; caption: ReactNode };
  no: { figure: ReactNode; caption: ReactNode };
}) {
  return (
    <div className="dd">
      <div className="dd__i dd__i--do">
        <p className="dd__k">
          <Tick /> Do
        </p>
        <div className="dd__f">{yes.figure}</div>
        <p className="dd__c">{yes.caption}</p>
      </div>
      <div className="dd__i dd__i--no">
        <p className="dd__k">
          <Cross /> Don’t
        </p>
        <div className="dd__f">{no.figure}</div>
        <p className="dd__c">{no.caption}</p>
      </div>
    </div>
  );
}

/** A numbered pin over the figure. `--l` is the leader line's length. */
export type Pin = {
  n: number;
  /** Which way the leader points: r, l, u, d. */
  dir: 'r' | 'l' | 'u' | 'd';
  style: CSSProperties & Record<`--${string}`, string | number>;
  title: string;
  body: ReactNode;
};

export function Anatomy({ figure, pins }: { figure: ReactNode; pins: Pin[] }) {
  return (
    <div className="anat">
      <div className="anat__fig">
        <div className="pin">
          {figure}
          {pins.map((p) => (
            <i key={p.n} data-l={p.dir} style={p.style}>
              {p.n}
            </i>
          ))}
        </div>
      </div>
      <div className="anat__l">
        {pins.map((p) => (
          <div key={p.n} className="anat__i">
            <span className="anat__n">{p.n}</span>
            <span className="anat__b">
              <b>{p.title}</b>
              <span>{p.body}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
