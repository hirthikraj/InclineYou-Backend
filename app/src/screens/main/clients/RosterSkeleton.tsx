/**
 * The roster, before it has been read.
 *
 * Shaped from the same metrics as the screen it stands in for — a 48px search
 * pill, a row of 36px chips, a group head, then rows at 64px with a 34px
 * avatar. When the real data lands nothing moves, which is the whole job: a
 * placeholder that does not match its screen just replaces one jump with two.
 *
 * Six rows, because six is roughly a screenful and a count that is nearly right
 * avoids the list growing or shrinking under the thumb on arrival.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { List, Skeleton, SkeletonHead, SkeletonRow, radius, space } from '../../../design';

const ROWS = 6;
/** The segment chips, in the widths their real labels come out at. */
const CHIPS = [58, 148, 84, 82];

export default function RosterSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading your clients">
      <Skeleton height={48} round={radius.full} />

      <View style={styles.chips}>
        {CHIPS.map((width, i) => (
          <Skeleton key={i} width={width} height={36} round={radius.r2} />
        ))}
      </View>

      <SkeletonHead />

      <List>
        {Array.from({ length: ROWS }, (_, i) => (
          // Only the first row carries a trailing control in the real list often
          // enough to be worth drawing; the rest would be guessing.
          <SkeletonRow key={i} grouped trailing={i === 0} />
        ))}
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.inset, paddingTop: 10 },
  chips: { flexDirection: 'row', gap: space.s1, marginTop: space.s3 },
});
