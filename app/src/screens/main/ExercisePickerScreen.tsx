/**
 * Pick one exercise, hand it back, pop.
 *
 * A second, thinner copy of the library (3c) — and deliberately so. That screen
 * is 1,324 rows sectioned by body part with filters, favourites and a create form,
 * and its pick mode writes straight into a *template's* blueprint. This one is
 * asked for by a **client's own program**, which is a different table, so it
 * cannot reuse that path without teaching the library a second write.
 *
 * What it does instead is answer one question — which exercise — and return the
 * answer through `exercisePick`, leaving the caller to decide what to do with
 * it. That keeps the write where it belongs and keeps this screen to a search
 * box and a list.
 *
 * Cancel rather than Back on the leading edge: this screen was opened mid-task
 * by something that is waiting on an answer, and "Cancel" is the accurate word
 * for leaving without giving one.
 */

import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/MainStack';
import { observeExerciseSearch } from '../../db/programs';
import { deliverPick } from '../../db/exercisePick';
import type Exercise from '../../db/models/Exercise';
import {
  AppBar,
  Empty,
  IconButton,
  IconDumbbell,
  IconX,
  List,
  Row,
  Search,
  Skeleton,
  SkeletonRow,
  Thumb,
  colors,
  radius,
  space,
} from '../../design';

type Props = NativeStackScreenProps<MainStackParamList, 'ExercisePicker'>;

/** `Row`'s grouped height. The list is told it rather than measuring 1,324 rows. */
const ROW_H = 64;

const itemLayout = (_: unknown, index: number) => ({
  length: ROW_H,
  offset: ROW_H * index,
  index,
});

export default function ExercisePickerScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sub = observeExerciseSearch(query).subscribe((next) => {
      setExercises(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, [query]);

  const pick = (exercise: Exercise) => {
    deliverPick({
      id: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup || null,
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Pick an exercise"
          subtitle={ready ? `${exercises.length} to choose from` : undefined}
          leading={
            <IconButton icon={IconX} label="Cancel" bare onPress={() => navigation.goBack()} />
          }
        />

        <Search
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or muscle"
          autoFocus
          trailing={
            query ? (
              <IconButton icon={IconX} label="Clear" bare size={18} onPress={() => setQuery('')} />
            ) : undefined
          }
          style={styles.search}
        />
      </View>

      {ready ? (
        <FlatList
          data={exercises}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          // The keyboard is up the whole time this screen is; a tap on a result
          // should pick it rather than spend itself dismissing the keyboard.
          keyboardShouldPersistTaps="handled"
          getItemLayout={itemLayout}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item, index }) => (
            /* `List` draws one card around a group of rows and a virtualised
               list has no group to wrap, so the border is per row and only the
               ends are rounded. */
            <View
              style={[
                styles.cell,
                index === 0 && styles.cellFirst,
                index === exercises.length - 1 && styles.cellLast,
              ]}
            >
              <Row
                grouped
                leading={
                  <Thumb
                    size="sm"
                    uri={item.imageUrl}
                    custom={item.isCustom}
                  />
                }
                title={item.name}
                subtitle={item.muscleGroup || undefined}
                highlight={query}
                onPress={() => pick(item)}
              />
            </View>
          )}
          ListEmptyComponent={
            <Empty
              icon={IconDumbbell}
              title={query ? `Nothing matches “${query}”` : 'The library is empty'}
              body={
                query
                  ? 'Try a shorter word — the search reads names and muscles, so “press” finds more than “bench press” does.'
                  : 'Exercises arrive with the first sync. Once one lands you can pick it here.'
              }
              style={styles.empty}
            />
          }
        />
      ) : (
        <View style={styles.body} accessibilityLabel="Loading the exercise library">
          <Skeleton width={104} height={10} style={styles.headGap} />
          <List>
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonRow key={i} grouped avatar={false} />
            ))}
          </List>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  search: { marginTop: 6, marginBottom: space.s3 },
  headGap: { marginTop: space.s5, marginBottom: space.s3 },

  cell: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  cellFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.r2,
    borderTopRightRadius: radius.r2,
  },
  cellLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.r2,
    borderBottomRightRadius: radius.r2,
  },
  empty: { marginTop: space.s7 },
});
