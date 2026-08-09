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
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './tokens';

export interface AppBarProps {
  title: string;
  subtitle?: string;
  /** The menu or back button. */
  leading?: React.ReactNode;
  /** Search, bell, a text button — laid out in the order given. */
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function AppBar({ title, subtitle, leading, actions, style }: AppBarProps) {
  return (
    <View style={[styles.bar, style]}>
      {leading}
      <View style={styles.main}>
        <Text numberOfLines={1} style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
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
  actions: { flexDirection: 'row', alignItems: 'center' },
});
