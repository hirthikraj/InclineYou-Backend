/**
 * `.tx-notice` — something changed, and it needs one tap.
 *
 * The second of the two components the client role adds. It carries a change the
 * client did not make and must acknowledge: their trainer moved a session.
 *
 * Three rules are built into it rather than left to the screen:
 *
 *  1. **The old value stays on screen, struck through.** A client shown only the
 *     new time cannot tell what changed and will ask — which is exactly the
 *     WhatsApp exchange this card exists to replace.
 *  2. **Info, not amber.** Nothing is wrong and nothing is owed. Amber here would
 *     read as a problem the client caused.
 *  3. **No glow, ever.** A notice that pulses reads as an alarm.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconClock, type IconProps } from './icons';
import { colors, radius, space } from './tokens';

export interface NoticeProps {
  /** "Ravi moved today's session". */
  title: string;
  /** When the change arrived — "8:41 AM". Not when it takes effect. */
  at?: string;
  icon?: React.ComponentType<IconProps>;
  /** The change itself. `from` is drawn struck through. */
  change?: { from: string; to: string };
  children?: React.ReactNode;
  /** The actions, laid out by the caller — a block primary and a text escape. */
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Notice({
  title,
  at,
  icon: Icon = IconClock,
  change,
  children,
  actions,
  style,
}: NoticeProps) {
  return (
    <View style={[styles.notice, style]}>
      <View style={styles.spine} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Icon size={17} color={colors.info} />
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {at ? <Text style={styles.at}>{at}</Text> : null}
        </View>

        {change ? (
          <View style={styles.change}>
            <Text style={styles.from}>{change.from}</Text>
            <Text style={styles.arrow}>→</Text>
            <Text style={styles.to}>{change.to}</Text>
          </View>
        ) : null}

        {children ? <View style={styles.text}>{children}</View> : null}
        {actions ? <View style={styles.acts}>{actions}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  spine: { width: 3, backgroundColor: colors.info },
  body: { flex: 1, padding: space.cardPad },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  at: { fontSize: 11.5, color: colors.ink3 },

  change: { flexDirection: 'row', alignItems: 'baseline', gap: space.s2, marginTop: space.s3 },
  from: {
    fontSize: 15,
    color: colors.ink3,
    textDecorationLine: 'line-through',
  },
  arrow: { fontSize: 14, color: colors.ink3 },
  to: { fontSize: 19, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },

  text: { marginTop: space.s3 },
  acts: { marginTop: space.s4 },
});
