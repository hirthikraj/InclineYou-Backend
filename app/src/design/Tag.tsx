/**
 * `.tx-tag` — a 22px status pill. Read-only, always.
 *
 * A tag is never a control: if it filters something it's a `Chip`, and if it
 * does something it's a `Button`. Keeping that line means a trainer can tell
 * at a glance which of the small rounded things on a row will do something
 * when tapped.
 *
 * `floor` / `remote` / `pr` are domain colours, not semantic ones — they carry
 * no good/bad meaning, they just have to stay the same colour everywhere.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius } from './tokens';

export type TagTone =
  | 'neutral'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'info'
  | 'floor'
  | 'remote'
  | 'pr'
  | 'accent';

export interface TagProps {
  label: string;
  tone?: TagTone;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<TagTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surface2, fg: colors.ink3 },
  ok: { bg: colors.okSoft, fg: colors.ok },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  floor: { bg: colors.floorSoft, fg: colors.floor },
  remote: { bg: colors.remoteSoft, fg: colors.remote },
  pr: { bg: colors.prSoft, fg: colors.pr },
  accent: { bg: colors.accentSoft, fg: colors.accentText },
};

export default function Tag({ label, tone = 'neutral', style }: TagProps) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }, style]}>
      <Text
        style={[styles.label, { color: fg }]}
        numberOfLines={1}
        maxFontSizeMultiplier={maxFontScale.micro}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    // `minHeight`, not `height`. The 22px is the resting size; at a large OS
    // font setting the box has to follow the text rather than crop it, and a
    // fixed height is what made this overflow its row.
    minHeight: 22,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radius.r1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
  },
});
