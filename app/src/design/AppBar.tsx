/**
 * `.tx-appbar--nav` — leading control, title + subtitle, trailing actions.
 *
 * This replaces the eyebrow/title bar wherever a drawer exists (§ 07). The
 * subtitle is doing real work: the teardown found that nobody in the category
 * greets by name, so the line under the title is where the day goes — the date
 * and the session count, which is the one thing a trainer opens the app to see.
 *
 * The title block is deliberately not pressable. § 04: "Nothing. It's a label,
 * not a control."
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, tnum } from './tokens';

export interface AppBarProps {
  title: string;
  subtitle?: string;
  /**
   * The one exception to "the title block is not a control".
   *
   * Screen 17's sub-line carries a **running session clock**, and §07 puts a tap
   * on it to hold the number still long enough to read. That is a control
   * because the thing in the slot moves; a date is not, and must not borrow
   * this. Only the subtitle becomes pressable — the title stays a label.
   */
  onSubtitlePress?: () => void;
  /**
   * A short tail on the subtitle that is never truncated.
   *
   * The workout log's sub-line is "Remote Core · Week 5 of 4 · 12:06", and at
   * 360dp with two trailing actions there is not room for all of it. Truncation
   * has to eat the least valuable thing, and left to itself it eats the last —
   * which here is the running clock, the one figure §07 says the bar is for.
   * So the clock is passed separately and keeps its width; the program name is
   * what gives way.
   */
  subtitleAside?: string;
  /** The menu or back button. */
  leading?: React.ReactNode;
  /** Search, bell, a text button — laid out in the order given. */
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function AppBar({
  title,
  subtitle,
  onSubtitlePress,
  subtitleAside,
  leading,
  actions,
  style,
}: AppBarProps) {
  const sub = subtitle ? (
    subtitleAside ? (
      <View style={styles.subRow}>
        <Text numberOfLines={1} style={styles.subtitleShrink}>
          {subtitle}
        </Text>
        <Text numberOfLines={1} style={styles.aside}>
          {' · '}
          {subtitleAside}
        </Text>
      </View>
    ) : (
      <Text numberOfLines={1} style={styles.subtitle}>
        {subtitle}
      </Text>
    )
  ) : null;

  return (
    <View style={[styles.bar, style]}>
      {leading}
      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {sub && onSubtitlePress ? (
          <Pressable
            onPress={onSubtitlePress}
            accessibilityRole="button"
            accessibilityLabel={`${subtitle}. Hold the clock still.`}
            hitSlop={{ top: 6, bottom: 10, left: 8, right: 8 }}
          >
            {sub}
          </Pressable>
        ) : (
          sub
        )}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 56,
    paddingVertical: 2,
  },
  main: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.38, color: colors.ink },
  subtitle: { fontSize: 12, color: colors.ink3, marginTop: 2 },
  subRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  subtitleShrink: { flexShrink: 1, minWidth: 0, fontSize: 12, color: colors.ink3 },
  aside: { flexShrink: 0, fontSize: 12, color: colors.ink3, ...tnum },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
