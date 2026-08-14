/**
 * 3c · Exercises.
 *
 * Hevy ships "400+ high-quality exercises" with filters for equipment and muscle
 * plus search. XRep shows 873 with the same two filters and one extra chip
 * Hevy buries: **Yours**. A custom exercise you built for one client's shoulder is
 * the one you will look for hardest, and burying it in the same alphabetical list
 * as the other 872 is the one thing that library gets wrong.
 *
 * Search matches **name, muscle and equipment** in one field, so typing "barbell"
 * works and nobody has to learn which box does what.
 *
 * Sectioned rather than one flat list: favourites first, then yours, then by
 * primary muscle. The grouping is how a trainer actually searches — "another
 * chest thing" is a real query and an alphabetical list cannot answer it.
 *
 * **Pick mode** (`pickFor`) is the same screen with one behaviour changed: a row
 * adds the exercise to a program's day and returns, instead of opening it. The
 * library a trainer already knows how to search is the right place to choose
 * from — a separate picker would be a second, worse copy of this screen, which
 * is exactly what the legacy builder had.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useTraining } from '../../../training/useTraining';
import { buildExercises, type ExerciseFilter } from '../../../training/training';
import { useAuth } from '../../../store/AuthContext';
import { addToBlueprint, toggleFavourite } from '../../../db/training';
import {
  AppBar,
  Chip,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconDumbbell,
  IconFilter,
  IconPlus,
  IconStar,
  IconX,
  Reveal,
  Row,
  Search,
  Seg,
  List,
  Skeleton,
  SkeletonRow,
  Thumb,
  Toast,
  colors,
  radius,
  space,
} from '../../../design';
import ExerciseFilterSheet from './ExerciseFilterSheet';
import ExerciseSheet from './ExerciseSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/**
 * A `SectionList`, and the 873 rows are all really here.
 *
 * This was a `ScrollView` with the list capped at 120 rows, on the reasoning that
 * sections are variable-length and the common case is a search. Both halves of
 * that were wrong. `SectionList` handles variable-length sections natively, and
 * the cap did not stop the cost — it just moved it: 120 rows is still about a
 * thousand views, and mounting them cost **1,158ms on the JS thread**, measured
 * on the second visit to the screen.
 *
 * The second visit is the one that exposed it. On the first, the warm cache is
 * empty, so the screen renders a cheap skeleton while the drawer closes and fills
 * in afterwards. On every visit after that the cache is warm, `ready` is true on
 * the very first render, and the entire list mounted synchronously *during the
 * push transition* — so the drawer could not leave, the animation stalled for a
 * second, and the previous screen showed through before Exercises appeared. The
 * warm cache made the second visit worse than the first.
 *
 * Virtualised, only the rows on screen mount, so a warm cache is a benefit again
 * rather than a stall — and the cap can go, which means the library no longer has
 * to explain that it is hiding 753 exercises from you.
 */

/** `Row`'s grouped height, which every row here has. */
const ROW_H = 64;

/**
 * Section headers vary in height only with the type scale, so the list is told
 * one number rather than measuring. Getting it slightly wrong costs a scrollbar
 * that drifts; measuring 873 rows costs the frame this whole change was about.
 */
const itemLayout = (_: unknown, index: number) => ({
  length: ROW_H,
  offset: ROW_H * index,
  index,
});

export default function ExercisesScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<MainStackParamList, 'Exercises'>>();
  const pickFor = params?.pickFor ?? null;
  const { trainerId } = useAuth();
  const { input, ready } = useTraining();

  const [query, setQuery] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [yoursOnly, setYoursOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filter = useMemo<ExerciseFilter>(
    () => ({ query, muscles, equipment, yoursOnly, favouritesOnly }),
    [query, muscles, equipment, yoursOnly, favouritesOnly],
  );

  const view = useMemo(() => buildExercises(input, filter), [input, filter]);

  const applied = muscles.length + equipment.length;

  /** `SectionList` wants `data`; the model speaks in `rows`. */
  const sections = useMemo(
    () => view.sections.map((s) => ({ key: s.key, title: s.title, data: s.rows })),
    [view.sections],
  );

  const star = (id: string, name: string, was: boolean) => {
    if (!trainerId) return;
    void toggleFavourite(trainerId, id)
      .then((now) => setNotice(now ? `${name} starred.` : `${name} unstarred.`))
      .catch(() => setNotice('Could not change that.'));
    void was;
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Exercises"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton icon={IconPlus} label="Add an exercise" bare onPress={() => setCreating(true)} />
          }
        />

        <Search
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${input.exercises.length || ''} exercises`.replace('  ', ' ')}
          trailing={
            query ? (
              <IconButton icon={IconX} label="Clear" bare size={18} onPress={() => setQuery('')} />
            ) : undefined
          }
          style={styles.search}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="Filter"
            icon={IconFilter}
            badge={applied}
            selected={applied > 0}
            onPress={() => setFilterOpen(true)}
          />
          <Chip
            label="Yours"
            count={view.yoursCount}
            selected={yoursOnly}
            onPress={() => setYoursOnly((v) => !v)}
          />
          <Chip
            label="Starred"
            count={view.favouriteCount}
            selected={favouritesOnly}
            onPress={() => setFavouritesOnly((v) => !v)}
          />
          {/* The applied muscle and equipment filters, each removable in one tap.
              A filter you can only clear by reopening the sheet is a filter you
              forget you set. */}
          {muscles.map((m) => (
            <Chip
              key={`m:${m}`}
              label={m}
              selected
              onPress={() => setMuscles((list) => list.filter((x) => x !== m))}
            />
          ))}
          {equipment.map((e) => (
            <Chip
              key={`e:${e}`}
              label={e}
              selected
              onPress={() => setEquipment((list) => list.filter((x) => x !== e))}
            />
          ))}
        </ScrollView>
      </View>

      <Reveal ready={ready} skeleton={<ExercisesSkeleton />} fill style={styles.reveal}>
        <SectionList
          sections={sections}
          keyExtractor={(row) => row.id}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          // The keyboard is up whenever the search box is, and a tap on a result
          // should open it rather than spend itself dismissing the keyboard.
          keyboardShouldPersistTaps="handled"
          // Every row is the same height, so the list can place a scrollbar and
          // jump without measuring 873 of them.
          getItemLayout={itemLayout}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          renderSectionHeader={({ section }) => (
            <GroupHead label={section.title} count={section.data.length} style={styles.head} />
          )}
          renderItem={({ item, index, section }) => (
            /* `List` draws the card around a group of rows, and a virtualised
               list has no group to wrap — so the border is drawn per row and the
               corners are rounded only at the ends. */
            <View
              style={[
                styles.cell,
                index === 0 && styles.cellFirst,
                index === section.data.length - 1 && styles.cellLast,
              ]}
            >
              <Row
                grouped
                leading={<Thumb size="sm" custom={item.custom} />}
                title={item.name}
                subtitle={item.meta}
                onPress={() => {
                  if (!pickFor) {
                    navigation.navigate('Exercise', { exerciseId: item.id });
                    return;
                  }
                  void addToBlueprint(pickFor.templateId, {
                    exerciseId: item.id,
                    day: pickFor.day,
                  }).then(() => navigation.goBack());
                }}
                trailing={
                  <IconButton
                    icon={(props) => <IconStar {...props} filled={item.favourite} />}
                    label={item.favourite ? `Unstar ${item.name}` : `Star ${item.name}`}
                    bare
                    size={18}
                    color={item.favourite ? colors.accentText : colors.ink3}
                    onPress={() => star(item.id, item.name, item.favourite)}
                  />
                }
              />
            </View>
          )}
          ListEmptyComponent={
            <Empty
              icon={IconDumbbell}
              title={query ? `Nothing matches “${query}”` : 'Nothing matches those filters'}
              body="Try fewer filters, or add it as your own exercise — the ones you invent are yours to reuse."
              style={styles.empty}
            />
          }
        />
      </Reveal>

      <ExerciseFilterSheet
        visible={filterOpen}
        muscles={view.muscleOptions}
        equipment={view.equipmentOptions}
        selectedMuscles={muscles}
        selectedEquipment={equipment}
        onApply={(m, e) => {
          setMuscles(m);
          setEquipment(e);
          setFilterOpen(false);
        }}
        onClose={() => setFilterOpen(false)}
      />

      <ExerciseSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          setNotice(`${name} added. It's yours to reuse.`);
        }}
      />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function ExercisesSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading the exercise library">
      <Skeleton width={104} height={10} style={styles.headGap} />
      <List>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonRow key={i} grouped avatar={false} />
        ))}
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  search: { marginTop: 6 },
  chips: { gap: space.s2, paddingTop: space.s3, paddingBottom: 2, paddingRight: space.inset },

  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  head: { backgroundColor: colors.canvas },

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
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
