/**
 * `.tx-sectionhead` — a micro label and, when there is somewhere to go, one
 * action on the right.
 *
 * The action is written as the destination and its size — "View all 3", "Full
 * schedule" — never "More". A count in the label is what makes a capped list
 * honest about being capped.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space } from './tokens';

export interface SectionHeadProps {
  label: string;
  action?: { label: string; onPress: () => void };
  /** First section on a screen sits tighter than the ones after it. */
  first?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function SectionHead({ label, action, first = false, style }: SectionHeadProps) {
  return (
    <View style={[styles.head, first && styles.headFirst, style]}>
      <Text style={styles.label} accessibilityRole="header">
        {label}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          // The CSS grows a 44px hit area with a pseudo-element; RN does it here.
          hitSlop={{ top: 16, bottom: 16, left: 10, right: 10 }}
        >
          {({ pressed }) => (
            <Text style={[styles.action, pressed && styles.actionPressed]}>{action.label}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sectionGap,
    marginBottom: space.s3,
  },
  headFirst: { marginTop: space.s5 },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  action: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.16,
    textTransform: 'uppercase',
    color: colors.accentText,
  },
  actionPressed: { opacity: 0.6 },
});
