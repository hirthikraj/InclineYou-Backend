/**
 * XRep iconography.
 *
 * Outline, 22px on a 24px optical box, 1.8px stroke, round caps and joins —
 * one family across both platforms. The path data is lifted straight from the
 * <defs> sprite in `agent/design system/screens/xreploginotp.html`, so these
 * are the same glyphs the design file draws.
 */

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from './tokens';

export interface IconProps {
  /** Optical box. The design system default is 22 on a 24 grid. */
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function useIcon({ size = 22, color = colors.ink2, strokeWidth = 1.8 }: IconProps) {
  return {
    frame: { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const },
    stroke: {
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    },
  };
}

/** i-back */
export function IconBack(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.1, ...props });
  return (
    <Svg {...frame}>
      <Path d="m15 18-6-6 6-6" {...stroke} />
    </Svg>
  );
}

/** i-check */
export function IconCheck(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.6, ...props });
  return (
    <Svg {...frame}>
      <Path d="m20 6-11 11-5-5" {...stroke} />
    </Svg>
  );
}

/** i-alert */
export function IconAlert(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.2, ...props });
  return (
    <Svg {...frame}>
      <Path d="M12 9v4.5M12 17.2h.01" {...stroke} />
      <Path d="M10.3 3.6 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" {...stroke} />
    </Svg>
  );
}

/** i-lock */
export function IconLock(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Rect x={4} y={10.5} width={16} height={11} rx={2.5} {...stroke} />
      <Path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" {...stroke} />
    </Svg>
  );
}

/** i-shield */
export function IconShield(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M12 22s8-3.4 8-9.6V5.3L12 2 4 5.3v7.1C4 18.6 12 22 12 22z" {...stroke} />
      <Path d="m9 12 2.2 2.2L15.5 10" {...stroke} />
    </Svg>
  );
}

/** i-refresh */
export function IconRefresh(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2, ...props });
  return (
    <Svg {...frame}>
      <Path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" {...stroke} />
    </Svg>
  );
}

/** i-msg — the WhatsApp fallback glyph */
export function IconMessage(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 1.7, ...props });
  return (
    <Svg {...frame}>
      <Path
        d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"
        {...stroke}
      />
      <Path
        d="M8.6 9.4c.3 1.9 2.1 3.7 4 4l.9-1.2 1.9.8-.3 1.4c-2.9.5-6.4-3-5.9-5.9l1.4-.3.8 1.9z"
        {...stroke}
      />
    </Svg>
  );
}

/** i-chevdown */
export function IconChevronDown(props: IconProps) {
  const { frame, stroke } = useIcon({ size: 13, strokeWidth: 2.4, ...props });
  return (
    <Svg {...frame}>
      <Path d="m6 9 6 6 6-6" {...stroke} />
    </Svg>
  );
}

/** i-cloud-off */
export function IconCloudOff(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 1.9, ...props });
  return (
    <Svg {...frame}>
      <Path d="M3 3l18 18M18.5 17.5H7a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 16 6.3" {...stroke} />
      <Path d="M19.4 9.6a4.5 4.5 0 0 1 .8 7.4" {...stroke} />
    </Svg>
  );
}

/** i-user */
export function IconUser(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" {...stroke} />
      <Circle cx={12} cy={7} r={4} {...stroke} />
    </Svg>
  );
}

/** i-users */
export function IconUsers(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...stroke} />
      <Circle cx={9} cy={7} r={4} {...stroke} />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" {...stroke} />
    </Svg>
  );
}

/** i-badge — a certification */
export function IconBadge(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Circle cx={12} cy={9} r={6} {...stroke} />
      <Path d="m8.2 14.2-1.2 7.3 5-2.5 5 2.5-1.2-7.3" {...stroke} />
    </Svg>
  );
}

/** i-rupee */
export function IconRupee(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M6 4h12M6 9.2h12M15.4 4c0 3.6-2.4 5.2-5.6 5.2H6l9 10.8" {...stroke} />
    </Svg>
  );
}

/** i-chart */
export function IconChart(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...stroke} />
    </Svg>
  );
}

/** i-search */
export function IconSearch(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2, ...props });
  return (
    <Svg {...frame}>
      <Circle cx={11} cy={11} r={7} {...stroke} />
      <Path d="m20 20-3.6-3.6" {...stroke} />
    </Svg>
  );
}

/** i-plus */
export function IconPlus(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.4, ...props });
  return (
    <Svg {...frame}>
      <Path d="M12 5v14M5 12h14" {...stroke} />
    </Svg>
  );
}

/* ------------------------------------------------------------------- chrome
 * Screen 03 adds a drawer, a tab bar and a notification centre; these are the
 * glyphs those need. Same sprite, same family.
 * -------------------------------------------------------------------------- */

/** i-menu */
export function IconMenu(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2, ...props });
  return (
    <Svg {...frame}>
      <Path d="M3 6h18M3 12h18M3 18h18" {...stroke} />
    </Svg>
  );
}

/** i-chev — points right; rotate for the rest */
export function IconChevron(props: IconProps) {
  const { frame, stroke } = useIcon({ size: 18, strokeWidth: 2, ...props });
  return (
    <Svg {...frame}>
      <Path d="m9 18 6-6-6-6" {...stroke} />
    </Svg>
  );
}

/** i-bell */
export function IconBell(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...stroke} />
      <Path d="M13.7 21a2 2 0 0 1-3.4 0" {...stroke} />
    </Svg>
  );
}

/** i-home */
export function IconHome(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...stroke} />
    </Svg>
  );
}

/** i-cal */
export function IconCalendar(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Rect x={3} y={4.5} width={18} height={17} rx={2.5} {...stroke} />
      <Path d="M3 10h18M8 2.5v4M16 2.5v4" {...stroke} />
    </Svg>
  );
}

/** i-wallet */
export function IconWallet(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...stroke} />
      <Path d="M3 10h18M16.5 14.5h.01" {...stroke} />
    </Svg>
  );
}

/** i-layers — a program */
export function IconLayers(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="m12 2.5 9.5 5-9.5 5-9.5-5z" {...stroke} />
      <Path d="m2.5 16.5 9.5 5 9.5-5M2.5 12l9.5 5 9.5-5" {...stroke} />
    </Svg>
  );
}

/** i-dumb */
export function IconDumbbell(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M6.5 6.5v11M3 9v5M10 8.2v7.6M14 8.2v7.6M21 9v5M17.5 6.5v11M10 12h4" {...stroke} />
    </Svg>
  );
}

/** i-play — the only solid glyph in the family, because a hollow play reads as paused */
export function IconPlay({ size = 22, color = colors.ink2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6.5 4.7 19 12 6.5 19.3z" fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

/** i-settings */
export function IconSettings(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Circle cx={12} cy={12} r={3.2} {...stroke} />
      <Path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1z"
        {...stroke}
      />
    </Svg>
  );
}

/** i-logout */
export function IconLogout(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...stroke} />
      <Path d="m16 17 5-5-5-5M21 12H9" {...stroke} />
    </Svg>
  );
}

/* ------------------------------------------------------------------ roster
 * The glyphs screen 04 adds. Same sprite, same family — sort and filter head
 * the roster's app bar, the rest live on the row menu and the selection bar.
 * -------------------------------------------------------------------------- */

/** i-sort */
export function IconSort(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M4 6h16M6.5 12h11M10 18h4" {...stroke} />
    </Svg>
  );
}

/** i-filter */
export function IconFilter(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2, ...props });
  return (
    <Svg {...frame}>
      <Path d="M3 5h18l-7 8v6l-4 2v-8z" {...stroke} />
    </Svg>
  );
}

/** i-useradd */
export function IconUserAdd(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 1.9, ...props });
  return (
    <Svg {...frame}>
      <Path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...stroke} />
      <Circle cx={8.5} cy={7} r={4} {...stroke} />
      <Path d="M19 8v6M22 11h-6" {...stroke} />
    </Svg>
  );
}

/** i-pause */
export function IconPause(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M9.5 4.5v15M14.5 4.5v15" {...stroke} />
    </Svg>
  );
}

/** i-repeat — resuming a paused client. */
export function IconRepeat(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="m17 2 4 4-4 4" {...stroke} />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14" {...stroke} />
      <Path d="m7 22-4-4 4-4" {...stroke} />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" {...stroke} />
    </Svg>
  );
}

/** i-trash */
export function IconTrash(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M3.5 6h17M8.5 6V4.2A1.2 1.2 0 0 1 9.7 3h4.6a1.2 1.2 0 0 1 1.2 1.2V6" {...stroke} />
      <Path d="M18.5 6v13.3a1.7 1.7 0 0 1-1.7 1.7H7.2a1.7 1.7 0 0 1-1.7-1.7V6" {...stroke} />
      <Path d="M10 11v5.5M14 11v5.5" {...stroke} />
    </Svg>
  );
}

/** i-x */
export function IconX(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.1, ...props });
  return (
    <Svg {...frame}>
      <Path d="M18 6 6 18M6 6l12 12" {...stroke} />
    </Svg>
  );
}

/** i-dots */
export function IconDots(props: IconProps) {
  const { size = 22, color = colors.ink2 } = props;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1.4} fill={color} />
      <Circle cx={12} cy={12} r={1.4} fill={color} />
      <Circle cx={12} cy={19} r={1.4} fill={color} />
    </Svg>
  );
}

/** i-send */
export function IconSend(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2, ...props });
  return (
    <Svg {...frame}>
      <Path d="M21.5 2.5 11 13" {...stroke} />
      <Path d="M21.5 2.5 15 21l-4-8-8-4z" {...stroke} />
    </Svg>
  );
}

/** i-inbox — the archive. */
export function IconInbox(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M21 12h-5l-1.6 2.6H9.6L8 12H3" {...stroke} />
      <Path d="M5.5 5.2 3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6l-2.5-6.8A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.2z" {...stroke} />
    </Svg>
  );
}

/* ------------------------------------------------------------------- diary
 * Screen 05 adds three: jump-to-today, the view switcher, and move.
 * -------------------------------------------------------------------------- */

/** i-clock2 — jump to today. */
export function IconClock(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Circle cx={12} cy={12} r={9} {...stroke} />
      <Path d="M12 7.2V12l3.2 2" {...stroke} />
    </Svg>
  );
}

/** i-grid — cycles day / week / month. */
export function IconGrid(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Rect x={3} y={3} width={7.5} height={7.5} rx={1.6} {...stroke} />
      <Rect x={13.5} y={3} width={7.5} height={7.5} rx={1.6} {...stroke} />
      <Rect x={3} y={13.5} width={7.5} height={7.5} rx={1.6} {...stroke} />
      <Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={1.6} {...stroke} />
    </Svg>
  );
}

/** i-move — reschedule. */
export function IconMove(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path
        d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"
        {...stroke}
      />
    </Svg>
  );
}

/* -------------------------------------------------------------- money · § 06 */

/** i-arrdown — money IN. Down and green, the जमा side of a bahi khata. */
export function IconArrowDown(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.4, ...props });
  return (
    <Svg {...frame}>
      <Path d="M12 5v14M19 12l-7 7-7-7" {...stroke} />
    </Svg>
  );
}

/** i-arrup — money OUT. Up and red, the उधार side. */
export function IconArrowUp(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 2.4, ...props });
  return (
    <Svg {...frame}>
      <Path d="M12 19V5M5 12l7-7 7 7" {...stroke} />
    </Svg>
  );
}

/** i-download */
export function IconDownload(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...stroke} />
      <Path d="m7 10 5 5 5-5M12 15V3" {...stroke} />
    </Svg>
  );
}

/** i-share */
export function IconShare(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" {...stroke} />
      <Path d="M16 6l-4-4-4 4M12 2v12" {...stroke} />
    </Svg>
  );
}

/** i-building — the gym. */
export function IconBuilding(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" {...stroke} />
      <Path d="M15 9h3a2 2 0 0 1 2 2v10" {...stroke} />
      <Path d="M9 7h2M9 11h2M9 15h2" {...stroke} />
    </Svg>
  );
}

/** i-percent — the cut. */
export function IconPercent(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M19 5 5 19" {...stroke} />
      <Circle cx={6.5} cy={6.5} r={2.5} {...stroke} />
      <Circle cx={17.5} cy={17.5} r={2.5} {...stroke} />
    </Svg>
  );
}

/** i-cash — money in your hand. */
export function IconCash(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Rect x={2} y={6} width={20} height={12} rx={2.4} {...stroke} />
      <Circle cx={12} cy={12} r={2.6} {...stroke} />
      <Path d="M6 10v4M18 10v4" {...stroke} />
    </Svg>
  );
}

/** i-qr */
export function IconQr(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Rect x={3} y={3} width={7} height={7} rx={1.4} {...stroke} />
      <Rect x={14} y={3} width={7} height={7} rx={1.4} {...stroke} />
      <Rect x={3} y={14} width={7} height={7} rx={1.4} {...stroke} />
      <Path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1M17.5 20.5h.01" {...stroke} />
    </Svg>
  );
}

/** i-backspace — the keypad's only non-digit. */
export function IconBackspace(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M21 5H9.4a2 2 0 0 0-1.5.7L3 12l4.9 6.3a2 2 0 0 0 1.5.7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" {...stroke} />
      <Path d="m17 9-5 6M12 9l5 6" {...stroke} />
    </Svg>
  );
}

/** i-edit */
export function IconEdit(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" {...stroke} />
      <Path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8l-4 1 1-4z" {...stroke} />
    </Svg>
  );
}

/** i-copy */
export function IconCopy(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Rect x={8.5} y={8.5} width={12.5} height={12.5} rx={2} {...stroke} />
      <Path
        d="M15.5 5.5V4.6A1.6 1.6 0 0 0 13.9 3H4.6A1.6 1.6 0 0 0 3 4.6v9.3a1.6 1.6 0 0 0 1.6 1.6h.9"
        {...stroke}
      />
    </Svg>
  );
}

/* ------------------------------------------------------ behind the drawer */

/** i-globe — languages */
export function IconGlobe(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Circle cx={12} cy={12} r={9} {...stroke} />
      <Path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" {...stroke} />
    </Svg>
  );
}

/** i-eye — what a client sees */
export function IconEye(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" {...stroke} />
      <Circle cx={12} cy={12} r={3} {...stroke} />
    </Svg>
  );
}

/**
 * i-star — a favourite.
 *
 * `filled` closes the outline in: the star is a toggle, and a toggle whose only
 * state cue is a colour change on a 20px glyph is a toggle nobody can read.
 */
export function IconStar({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  const { frame, stroke } = useIcon(props);
  const d = 'm12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z';
  return (
    <Svg {...frame}>
      <Path d={d} {...stroke} fill={filled ? stroke.stroke : 'none'} />
    </Svg>
  );
}

/** i-ban — a no-show */
export function IconBan(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Circle cx={12} cy={12} r={9} {...stroke} />
      <Path d="m5.6 5.6 12.8 12.8" {...stroke} />
    </Svg>
  );
}

/** i-flag — report a problem */
export function IconFlag(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M4 21V4h9l.7 2H20v9h-6.3l-.7-2H4" {...stroke} />
    </Svg>
  );
}

/* -------------------------------------------------- workout log · screen 17 */

/** i-minus — the stepper's other end. */
export function IconMinus(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M5 12h14" {...stroke} />
    </Svg>
  );
}

/** i-swap — two arrows passing. Swap, don't skip. */
export function IconSwap(props: IconProps) {
  const { frame, stroke } = useIcon(props);
  return (
    <Svg {...frame}>
      <Path d="M3 8h14M13.5 4.5 17 8l-3.5 3.5" {...stroke} />
      <Path d="M21 16H7M10.5 12.5 7 16l3.5 3.5" {...stroke} />
    </Svg>
  );
}

/** i-grip — six dots. Only ever on a card that can be dragged. */
export function IconGrip(props: IconProps) {
  const { size = 22, color = colors.ink3 } = props;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {[6, 12, 18].map((y) => (
        <React.Fragment key={y}>
          <Circle cx={9} cy={y} r={1.35} fill={color} />
          <Circle cx={15} cy={y} r={1.35} fill={color} />
        </React.Fragment>
      ))}
    </Svg>
  );
}

/* -------------------------------------------------------------------- flags
 * Not part of the outline family above — a flag is a picture, not an icon.
 * It only ever appears inside a country-code segment.
 * -------------------------------------------------------------------------- */

/** India. 18 × 13, the ratio the design file draws it at. */
export function FlagIN({ width = 18 }: { width?: number }) {
  const height = (width / 18) * 13;
  return (
    <Svg width={width} height={height} viewBox="0 0 18 13" style={{ borderRadius: 2 }}>
      <Rect width={18} height={4.33} fill="#FF9933" />
      <Rect y={4.33} width={18} height={4.33} fill="#FFFFFF" />
      <Rect y={8.66} width={18} height={4.34} fill="#138808" />
      <Circle cx={9} cy={6.5} r={1.5} fill="none" stroke="#000080" strokeWidth={0.7} />
    </Svg>
  );
}

/**
 * i-phone — the one icon the client role adds.
 *
 * It marks the single action in the client app that leaves the phone without
 * drafting anything first: dialling their trainer. Everything else that reaches
 * him opens a WhatsApp draft and sends nothing silently, which is why this glyph
 * is never used for messaging.
 */
export function IconPhone(props: IconProps) {
  const { frame, stroke } = useIcon({ strokeWidth: 1.7, ...props });
  return (
    <Svg {...frame}>
      <Path
        d="M6.2 3.5h3l1.4 3.6-2 1.4a11.4 11.4 0 0 0 5.4 5.4l1.4-2 3.6 1.4v3a2 2 0 0 1-2.2 2A15.6 15.6 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2z"
        {...stroke}
      />
    </Svg>
  );
}
