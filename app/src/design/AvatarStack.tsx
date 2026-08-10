/**
 * `.tx-avatars` — overlapped avatars for "these people", in a sheet header.
 *
 * Capped, and the overflow is a count rather than more circles: past four the
 * faces stop being recognisable and start being a texture, and the number is
 * the part that matters when you are about to message all of them.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Avatar, { type AvatarSize } from './Avatar';
import { colors, maxFontScale, tnum } from './tokens';

const OVERLAP: Partial<Record<AvatarSize, number>> = { xs: -5, sm: -8, md: -8 };

export default function AvatarStack({
  names,
  size = 'xs',
  max = 4,
  style,
}: {
  names: string[];
  size?: AvatarSize;
  max?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const shift = OVERLAP[size] ?? -8;

  return (
    <View style={[styles.stack, style]}>
      {shown.map((name, i) => (
        <Avatar
          key={`${name}-${i}`}
          name={name}
          size={size}
          style={[styles.face, i > 0 && { marginLeft: shift }]}
        />
      ))}
      {rest > 0 ? (
        <Text style={styles.rest} maxFontSizeMultiplier={maxFontScale.micro}>
          +{rest}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 2, borderColor: colors.surface },
  rest: { marginLeft: 6, fontSize: 11, fontWeight: '700', color: colors.ink3, ...tnum },
});
