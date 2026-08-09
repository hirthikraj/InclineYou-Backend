/**
 * Train X iconography.
 *
 * Outline, 22px on a 24px optical box, 1.8px stroke, round caps and joins —
 * one family across both platforms. The path data is lifted straight from the
 * <defs> sprite in `agent/design system/screens/trainxloginotp.html`, so these
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
