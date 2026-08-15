/**
 * The book, before it has been read.
 *
 * The one screen where the placeholder matters most, because the real thing
 * opens with two large figures and a chase list — and the old behaviour was to
 * render those as ₹0 and "everything clear", which is not a loading state but a
 * false one.
 *
 * Laid out as the screen is: the month strip, the figures card, the gym-share
 * row, then ledger rows inside one surface.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ledger, Skeleton, SkeletonHead, SkeletonRow, radius, space } from '../../../design';

const MONTHS = 4;
const ENTRIES = 5;

export default function MoneySkeleton({ share = true }: { share?: boolean }) {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading your book">
      <View style={styles.months}>
        {Array.from({ length: MONTHS }, (_, i) => (
          <Skeleton key={i} width={70} height={48} round={radius.r2} />
        ))}
      </View>

      <Skeleton height={44} round={radius.r2} style={styles.views} />

      {/* The figures card: two numbers, the split bar and its legend. */}
      <Skeleton height={148} round={radius.r3} style={styles.figures} />

      {share ? <Skeleton height={62} round={radius.r2} style={styles.share} /> : null}

      <SkeletonHead />

      <Ledger>
        {Array.from({ length: ENTRIES }, (_, i) => (
          // The ledger's leading mark is a 30px circle, not a 34px avatar.
          <SkeletonRow key={i} grouped />
        ))}
      </Ledger>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.inset, paddingTop: 10 },
  months: { flexDirection: 'row', gap: 6 },
  views: { marginTop: space.s3 },
  figures: { marginTop: space.s4 },
  share: { marginTop: 10 },
});
