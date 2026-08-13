/**
 * `.tx-timeline` — resumable multi-step state.
 *
 * Not a list of equal rows: a completed step carries the answer that was given,
 * the next one is lit, and the rest recede. That is the whole reason it exists
 * — someone coming back a day later needs to see what they already said, not
 * just how many boxes are ticked.
 *
 * Where it appears there is no segmented bar. The timeline IS the progress
 * indicator, and two progress systems on one screen contradict each other.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, tnum } from './tokens';
import { IconCheck } from './icons';

export type TimelineState = 'done' | 'now' | 'todo';

/* The rail hangs off the left of the content column. These are the CSS offsets
   read back as positive numbers: content sits at RAIL_GUTTER, the dot's canvas
   ring is centred on the rail. */
const RAIL_GUTTER = 34;
const DOT = 22;
const RING = 4;

export function Timeline({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.timeline, style]}>{children}</View>;
}

export interface TimelineItemProps {
  /** 1-based, shown inside the dot unless the step is done. */
  index: number;
  label: string;
  /** The answer already given, or what's coming — never both. */
  meta?: string;
  state: TimelineState;
  /**
   * Replaces whatever the dot would otherwise draw.
   *
   * The client file's program history needs an em dash for the stretch with no
   * program: that period is a real part of somebody's training, and a tick
   * there would congratulate them for it while a "0" would read as a count.
   */
  mark?: string;
  /** The rail stops at the last item; nothing connects to below it. */
  last?: boolean;
}

export function TimelineItem({ index, label, meta, state, mark, last = false }: TimelineItemProps) {
  const done = state === 'done';
  const now = state === 'now';

  return (
    <View
      style={[styles.item, last && styles.itemLast]}
      accessibilityLabel={`Step ${index}, ${label}${meta ? `, ${meta}` : ''}, ${state === 'todo' ? 'not started' : state}`}
    >
      {last ? null : <View style={[styles.rail, done && styles.railDone]} />}

      {/* The canvas ring is a real view: an RN border would eat into the dot,
          and a shadow can't be a hard 4px ring on both platforms. */}
      <View style={styles.ring}>
        <View
          style={[styles.dot, done && !mark && styles.dotDone, now && styles.dotNow]}
        >
          {mark ? (
            <Text style={[styles.dotText, now && styles.dotTextNow]}>{mark}</Text>
          ) : done ? (
            <IconCheck size={12} color="#FFFFFF" strokeWidth={3.4} />
          ) : (
            <Text style={[styles.dotText, now && styles.dotTextNow]}>{index}</Text>
          )}
        </View>
      </View>

      <Text style={[styles.label, state === 'todo' && styles.labelTodo, now && styles.labelNow]}>
        {label}
      </Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { paddingLeft: RAIL_GUTTER },

  item: { position: 'relative', paddingBottom: 18, minHeight: 40 },
  itemLast: { paddingBottom: 0 },

  rail: {
    position: 'absolute',
    left: -(RAIL_GUTTER - DOT / 2) - 1,
    top: 26,
    bottom: -2,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.lineStrong,
  },
  railDone: { backgroundColor: colors.ok },

  ring: {
    position: 'absolute',
    left: -(RAIL_GUTTER + RING),
    top: -RING,
    width: DOT + RING * 2,
    height: DOT + RING * 2,
    borderRadius: radius.full,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.ok },
  dotNow: { backgroundColor: colors.accent },
  dotText: { fontSize: 11, fontWeight: '800', color: colors.ink3, ...tnum },
  dotTextNow: { color: colors.accentInk },

  label: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.23, lineHeight: 22, color: colors.ink },
  labelTodo: { fontWeight: '500', color: colors.ink3 },
  labelNow: { color: colors.accentText },
  meta: { fontSize: 12.5, lineHeight: 17.5, color: colors.ink3, marginTop: 2 },
});
