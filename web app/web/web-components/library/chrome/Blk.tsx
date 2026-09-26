import type { CSSProperties, ReactNode } from 'react';

/** One titled block inside a component's page — Specimen, Variants, States… */
export function Blk({
  title,
  tag,
  lede,
  children,
}: {
  title: string;
  /** The muted word on the right of the rule, e.g. `guidelines`. */
  tag?: string;
  lede?: ReactNode;
  /* Optional: a block that is only its lede is a legitimate block. Several
     components are best explained by a paragraph with nothing to stand under
     it, and padding those out with a specimen nobody needs is worse. */
  children?: ReactNode;
}) {
  return (
    /* `data-blk` is the block's own title, and it exists for one reader: the
       `<Viewport>` frame route, which shows the SPECIMEN block and hides the
       rest. Framed whole, a component page puts its prose, its variants table
       and its states matrix inside a 390px box — so the frame reported how the
       DOCUMENTATION reflows, which is the library's business and not the design
       system's. The attribute is here rather than a prop because every block
       already has a title and nothing had to be re-declared to use it. */
    <div className="blk" data-blk={title}>
      <div className="blk__t">
        <h4>{title}</h4>
        {tag ? <span>{tag}</span> : null}
      </div>
      {lede ? <p className="blk__p">{lede}</p> : null}
      {children}
    </div>
  );
}

/**
 * The surface a specimen stands on.
 *
 * This is the one place the library and the product genuinely share a canvas:
 * whatever is rendered inside is the application's own component, on the
 * application's own background token, at life size.
 */
export function Bench({
  pad = true,
  tight,
  plain,
  style,
  children,
}: {
  pad?: boolean;
  tight?: boolean;
  plain?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const cls = ['bench', pad ? 'bench--pad' : null, tight ? 'bench--tight' : null, plain ? 'bench--plain' : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <div className="bench__row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap', ...style }}>
        {children}
      </div>
    </div>
  );
}

/** A specimen with a caption over it. The caption is the spec, not decoration. */
export function Cell({
  label,
  center,
  stretch,
  children,
}: {
  label: string;
  center?: boolean;
  /*
   * Fill the cell's width instead of hugging the specimen.
   *
   * §23's `.cell` is a column flex with `align-items:flex-start`, so its
   * contents shrink to their own width — right for a chip or a button, wrong
   * for anything that takes its size from the column it sits in. A session
   * block has no intrinsic width (on the schedule it is positioned into a day),
   * so inside a plain cell it collapsed to 15.6px and the time wrapped one
   * character per line.
   */
  stretch?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={center ? 'cell cell--c' : 'cell'} style={stretch ? { alignSelf: 'stretch' } : undefined}>
      <span className="cell__l">{label}</span>
      <div style={stretch ? { width: '100%' } : undefined}>{children}</div>
    </div>
  );
}
