/**
 * `.tx-pack` — sessions left, as a figure over a 42px bar.
 *
 * The teardown's one real disagreement with the category: My PT Hub and the
 * rest put packages in a billing area, but a trainer selling ten-session packs
 * needs "how many left" while looking at the person, not two screens away. So
 * it rides the roster row.
 *
 * Colour is the same ladder the rows use — ok while there is room, warn at two
 * or fewer, danger at zero — so a scan down the right edge of the roster reads
 * the same way as a scan down the left.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, maxFontScale, tnum } from './tokens';

/** At or below this many sessions the pack is worth renewing. Matches `deck.PACK_ENDING`. */
export const PACK_LOW = 2;

export interface PackProps {
  remaining: number;
  total?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Pack({ remaining, total, style }: PackProps) {
  const tone = remaining <= 0 ? colors.danger : remaining <= PACK_LOW ? colors.warn : colors.ok;
  const ink = remaining <= 0 ? colors.danger : remaining <= PACK_LOW ? colors.warn : colors.ink;
  const filled = total && total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;

  return (
    <View
      style={[styles.pack, style]}
      accessibilityLabel={
        total ? `${remaining} of ${total} sessions left` : `${remaining} sessions left`
      }
    >
      <Text style={[styles.value, { color: ink }]} maxFontSizeMultiplier={maxFontScale.micro}>
        {remaining}
        {total ? <Text style={styles.total}>/{total}</Text> : null}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${filled * 100}%`, backgroundColor: tone }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pack: { alignItems: 'flex-end', gap: 5, flexShrink: 0, minWidth: 42 },
  value: { fontSize: 14, fontWeight: '800', letterSpacing: -0.28, ...tnum },
  total: { fontSize: 10.5, fontWeight: '700', color: colors.ink3 },
  bar: { width: 42, height: 3, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
