/**
 * `.tx-agenda` — the day, as an agenda on a time gutter.
 *
 * Every platform in the teardown draws an hour grid. An hour grid is the wrong
 * shape for a split shift: two thirds of it is empty by design, and the one
 * object worth acting on — the gap — is drawn as blank space. So rows size to
 * their content, the time sits in a 44px gutter beside them, and the empty
 * hours collapse into `GapBar`.
 *
 * Five parts, all presentational: the row wrapper with its gutter, the now
 * line, the folded gap, a bookable slot, and the dashed block.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, radius, space, tnum } from './tokens';
import { IconClock, IconPlus } from './icons';

/** The gutter width the whole screen is indented by. */
const GUTTER = 52;

export function Agenda({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.agenda, style]}>{children}</View>;
}

/** One row plus its time. Pass no time and the row spans the gutter too. */
export function AgendaItem({
  time,
  meridiem,
  children,
  bleed = false,
}: {
  time?: string;
  meridiem?: string;
  children: React.ReactNode;
  /** Ignores the gutter — used by callouts and the folded-gap header. */
  bleed?: boolean;
}) {
  return (
    <View style={[styles.item, bleed && styles.itemBleed]}>
      {time ? (
        <View style={styles.gutter} pointerEvents="none">
          <Text style={styles.time} maxFontSizeMultiplier={maxFontScale.micro}>
            {time}
          </Text>
          {meridiem ? (
            <Text style={styles.meridiem} maxFontSizeMultiplier={maxFontScale.micro}>
              {meridiem}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/**
 * `.tx-now` — a real 1px rule with a time chip.
 *
 * Borrowed from Google and Apple Calendar, and it has to read as a position in
 * time rather than as a session, which is why it is a line and not a card.
 */
export function NowLine({ label }: { label: string }) {
  return (
    <View style={styles.now} accessibilityLabel={`Now, ${label}`}>
      <View style={styles.nowChip}>
        <Text style={styles.nowText} maxFontSizeMultiplier={maxFontScale.micro}>
          {label}
        </Text>
      </View>
      <View style={styles.nowRule} />
    </View>
  );
}

/**
 * `.tx-gap` — dead time, folded.
 *
 * The most valuable object on this screen: an empty slot at 11am is lost
 * revenue, and no competitor treats it as anything at all.
 */
export function GapBar({
  label,
  from,
  to,
  onPress,
  open = false,
}: {
  label: string;
  from: string;
  to: string;
  onPress: () => void;
  open?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label} free, ${from} to ${to}. Book`}
      style={({ pressed }) => [styles.gap, pressed && styles.gapPressed]}
    >
      <IconClock size={16} color={colors.ink3} strokeWidth={1.8} />
      <Text style={styles.gapText} numberOfLines={1}>
        <Text style={styles.gapStrong}>{label}</Text> free · {from} – {to}
      </Text>
      <Text style={styles.gapAction} maxFontSizeMultiplier={maxFontScale.micro}>
        {open ? 'Close' : 'Book'}
      </Text>
    </Pressable>
  );
}

/** `.tx-slot` — a bookable hole, dashed so it never reads as a booking. */
export function FreeSlot({
  minutes,
  onPress,
  onLongPress,
}: {
  minutes: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Free, ${minutes} minutes. Book`}
      style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
    >
      <IconPlus size={17} color={colors.ink3} strokeWidth={2.2} />
      <Text style={styles.slotLabel}>Free</Text>
      <Text style={styles.slotMinutes} maxFontSizeMultiplier={maxFontScale.micro}>
        {minutes} min
      </Text>
    </Pressable>
  );
}

/** A time block, drawn as what it is: a hole somebody put there on purpose. */
export function BlockBar({ label, onPress }: { label: string; onPress?: () => void }) {
  const inner = (
    <>
      <Text style={styles.blockLabel} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.block}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.block, pressed && styles.gapPressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  agenda: { paddingLeft: GUTTER },
  item: { marginBottom: space.s2 },
  itemBleed: { marginLeft: -GUTTER },
  gutter: { position: 'absolute', left: -GUTTER, width: 44, alignItems: 'flex-end', paddingTop: 3 },
  time: { fontSize: 11, fontWeight: '700', color: colors.ink3, ...tnum },
  meridiem: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.54,
    color: colors.ink3,
    marginTop: 1,
  },
  body: { minWidth: 0 },

  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    marginTop: 2,
    marginBottom: 10,
    marginLeft: -GUTTER,
  },
  nowChip: {
    backgroundColor: colors.accent,
    borderRadius: radius.r1,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  nowText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: colors.accentInk, ...tnum },
  nowRule: { flex: 1, height: 1, backgroundColor: colors.accent },

  gap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    minHeight: 46,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  gapPressed: { backgroundColor: colors.surface2 },
  gapText: { flex: 1, fontSize: 12.5, color: colors.ink3 },
  gapStrong: { fontWeight: '700', color: colors.ink2, ...tnum },
  gapAction: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: colors.accentText,
  },

  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight: 52,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },
  slotPressed: { backgroundColor: colors.surface },
  slotLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.ink2 },
  slotMinutes: { fontSize: 11, fontWeight: '700', color: colors.ink3, ...tnum },

  block: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface2,
  },
  blockLabel: { fontSize: 12.5, fontWeight: '600', color: colors.ink3 },
});
