import { Glyph } from '@/components/shell/Icons';

/**
 * The glyphs this screen needs and the shell does not have.
 *
 * `Ruler` is the exception and lives in `components/shell/Icons.tsx`, because
 * the section pane draws it — a glyph in the navigation column belongs with the
 * navigation column's own set, and one imported from a screen would be a rail
 * row that breaks when that screen is refactored.
 */

/** Questions. A list with ticks down the side, not speech marks — the client
 *  ANSWERS these; they are not a conversation. */
export function Checklist({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 6.5 4.6 8.2 7.8 5M3 12.5l1.6 1.7L7.8 11M3 18.5l1.6 1.7 3.2-3.2" />
      <path d="M11 6.6h10M11 12.9h10M11 19.2h7" />
    </Glyph>
  );
}

/** Add. The plain plus, at the size a row's leading slot uses. */
export function Plus({ size = 15 }: { size?: number }) {
  return <Glyph size={size} d="M12 5.5v13M5.5 12h13" />;
}

/** Remove a row from a list. A bin, which is the one this product draws. */
export function Bin({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
    </Glyph>
  );
}

/** The unread mark's companion — an open envelope, for *mark it read*. */
export function Envelope({ size = 15 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.6 6.6 8.4 6.4 8.4-6.4" />
    </Glyph>
  );
}
