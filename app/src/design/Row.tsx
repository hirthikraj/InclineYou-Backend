/**
 * `.tx-row` and `.tx-list` — the standard tappable row, loose or grouped.
 *
 * Standalone, a row is its own card. Inside a `List` it drops its radius and
 * border and gains a hairline underneath, so a group of them reads as one
 * surface rather than a stack of cards with gaps.
 *
 * Two decorations exist and they mean different things. `severity` paints a
 * 2px bar down the leading edge and is for a row that wants something from you
 * — an overdue payment, a client gone quiet. `spine` is the schedule's own
 * marker: accent for the session happening now, ok for one already done. A row
 * never carries both, because a schedule row is not an alert.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, tnum } from './tokens';

export function List({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children);
  return (
    <View style={[styles.list, style]}>
      {items.map((child, i) => (
        <View key={i} style={i < items.length - 1 ? styles.listDivider : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export type RowSeverity = 'alert' | 'critical';
export type RowSpine = 'now' | 'done' | 'idle';

export interface RowProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Set when the row sits inside a `List`, which owns the border and radius. */
  grouped?: boolean;
  selected?: boolean;
  /** Avatar, icon, time block — anything before the text. */
  leading?: React.ReactNode;
  /** Trailing content — a tag, a small button, a value. */
  trailing?: React.ReactNode;
  /** Leading-edge bar. Attention rows only. */
  severity?: RowSeverity;
  /** Schedule marker. Mutually exclusive with `severity`. */
  spine?: RowSpine;
  /** A finished session sits back without disappearing. */
  dim?: boolean;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}

export function Row({
  title,
  subtitle,
  onPress,
  onLongPress,
  grouped = false,
  selected = false,
  leading,
  trailing,
  severity,
  spine,
  dim = false,
  minHeight,
  style,
}: RowProps) {
  const content = (pressed: boolean) => [
    styles.row,
    grouped && styles.rowGrouped,
    dim && styles.rowDim,
    minHeight !== undefined && { minHeight },
    pressed && styles.rowPressed,
    style,
  ];

  const inner = (
    <>
      {severity ? (
        <View
          style={[styles.severity, severity === 'critical' ? styles.severityCritical : styles.severityAlert]}
          pointerEvents="none"
        />
      ) : null}
      {leading}
      {spine ? <View style={[styles.spine, spineTones[spine]]} /> : null}
      <View style={styles.main}>
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  if (!onPress && !onLongPress) return <View style={content(false)}>{inner}</View>;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ selected }}
      style={({ pressed }) => content(pressed)}
    >
      {inner}
    </Pressable>
  );
}

/** `.tx-row__time` — the 52px clock column on a schedule row. */
export function RowTime({ time, meridiem }: { time: string; meridiem?: string }) {
  return (
    <View style={styles.time}>
      <Text style={styles.timeValue}>{time}</Text>
      {meridiem ? <Text style={styles.timeMeridiem}>{meridiem}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.r2,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  listDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    width: '100%',
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: space.s3,
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  rowGrouped: { borderRadius: 0, borderWidth: 0 },
  rowPressed: { backgroundColor: colors.surface2 },
  rowDim: { opacity: 0.5 },

  severity: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
  severityAlert: { backgroundColor: colors.warn },
  severityCritical: { backgroundColor: colors.danger },

  spine: { width: 2, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.lineStrong },

  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.23, color: colors.ink },
  subtitle: { fontSize: 12.5, color: colors.ink2, marginTop: 3 },

  time: { width: 52, flexShrink: 0 },
  timeValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, color: colors.ink, ...tnum },
  timeMeridiem: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: colors.ink3,
    marginTop: 2,
  },
});

const spineTones = StyleSheet.create({
  now: { backgroundColor: colors.accent },
  done: { backgroundColor: colors.ok },
  idle: { backgroundColor: colors.lineStrong },
});
