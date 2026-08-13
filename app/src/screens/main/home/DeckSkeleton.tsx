/**
 * The deck, before it has been read.
 *
 * Mirrors what Home actually opens with: the hero card, the three-stat rail,
 * then a section head and a few session rows. The hero is the tallest object on
 * the screen and the one carrying the countdown, so getting its height roughly
 * right is what stops everything below it sliding on arrival.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { List, Skeleton, SkeletonHead, SkeletonRow, StatRail, radius, space } from '../../../design';

const ROWS = 3;

export default function DeckSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading your day">
      {/* The hero: the accent panel with the time, then the name and actions. */}
      <Skeleton height={232} round={radius.r3} />

      <StatRail style={styles.rail}>
        <Skeleton height={78} round={radius.r2} />
        <Skeleton height={78} round={radius.r2} />
        <Skeleton height={78} round={radius.r2} />
      </StatRail>

      <SkeletonHead />

      <List>
        {Array.from({ length: ROWS }, (_, i) => (
          <SkeletonRow key={i} grouped trailing />
        ))}
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.inset, paddingTop: space.s3 },
  rail: { marginTop: space.s4 },
});
