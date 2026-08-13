/**
 * 3e · search.
 *
 * One search across clients, exercises and programs, reached from the bar on
 * any screen. Deliberately not a second dashboard-scoped search: a trainer
 * looking for "mee" wants Meera Shah and the Meadows row, and having to
 * remember which of three search boxes holds which is the failure mode this
 * avoids.
 *
 * Results are grouped by kind and each group is capped, because on a phone the
 * answer is almost always in the first two rows and an uncapped list buries the
 * groups underneath it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import type { MainStackParamList } from '../../navigation/MainStack';
import { database } from '../../db';
import type ClientModel from '../../db/models/Client';
import type ExerciseModel from '../../db/models/Exercise';
import type ProgramModel from '../../db/models/Program';
import {
  Avatar,
  Callout,
  Empty,
  IconBack,
  IconButton,
  IconDumbbell,
  IconLayers,
  IconSearch,
  List,
  Row,
  Search,
  colors,
  space,
} from '../../design';

/** Two rows per group is what fits above the keyboard on a 360×640 screen. */
const PER_GROUP = 4;
/** Below this a search matches half the library and helps nobody. */
const MIN_QUERY = 2;

type Results = {
  clients: ClientModel[];
  exercises: ExerciseModel[];
  programs: ProgramModel[];
};

const EMPTY: Results = { clients: [], exercises: [], programs: [] };

export default function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(EMPTY);

  const term = query.trim();

  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setResults(EMPTY);
      return;
    }
    let live = true;
    // Debounced: the exercise library is the biggest table in the app and
    // re-querying it on every keystroke makes the field feel sticky.
    const t = setTimeout(() => {
      void runSearch(term).then((found) => {
        if (live) setResults(found);
      });
    }, 140);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [term]);

  const total = results.clients.length + results.exercises.length + results.programs.length;
  const programNames = useMemo(
    () => new Map(results.clients.map((c) => [c.id, c.name])),
    [results.clients],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.bar}>
        <IconButton icon={IconBack} label="Back" bare size={22} onPress={() => navigation.goBack()} />
        <Search
          value={query}
          onChangeText={setQuery}
          placeholder="Clients, exercises, programs"
          autoFocus
          style={styles.field}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {term.length < MIN_QUERY ? (
          <Callout icon={IconSearch} style={styles.callout}>
            One search across clients, exercises and programs. Type at least two letters.
          </Callout>
        ) : total === 0 ? (
          <Empty
            icon={IconSearch}
            title="No matches"
            body={`Nothing called "${term}" in your clients, exercises or programs.`}
          />
        ) : (
          <>
            {results.clients.length > 0 ? (
              <>
                <GroupLabel>Clients</GroupLabel>
                <List>
                  {results.clients.map((client) => (
                    <Row
                      key={client.id}
                      grouped
                      title={client.name}
                      subtitle={client.goal || client.phone || 'No goal set'}
                      leading={<Avatar name={client.name} size="sm" />}
                      onPress={() =>
                        navigation.navigate('ClientDetail', { clientId: client.id })
                      }
                    />
                  ))}
                </List>
              </>
            ) : null}

            {results.exercises.length > 0 ? (
              <>
                <GroupLabel>Exercises</GroupLabel>
                <List>
                  {results.exercises.map((exercise) => (
                    <Row
                      key={exercise.id}
                      grouped
                      minHeight={56}
                      title={exercise.name}
                      subtitle={
                        [exercise.muscleGroup, exercise.equipment].filter(Boolean).join(' · ') ||
                        undefined
                      }
                      leading={<IconDumbbell size={20} color={colors.ink2} />}
                      onPress={() => navigation.navigate('Exercise', { exerciseId: exercise.id })}
                    />
                  ))}
                </List>
              </>
            ) : null}

            {results.programs.length > 0 ? (
              <>
                <GroupLabel>Programs</GroupLabel>
                <List>
                  {results.programs.map((program) => (
                    <Row
                      key={program.id}
                      grouped
                      minHeight={56}
                      title={program.name}
                      subtitle={programNames.get(program.clientId) ?? program.goal ?? undefined}
                      leading={<IconLayers size={20} color={colors.ink2} />}
                      onPress={() => navigation.navigate('ProgramDetail', { programId: program.id })}
                    />
                  ))}
                </List>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text style={styles.group} accessibilityRole="header">
      {children}
    </Text>
  );
}

async function runSearch(term: string): Promise<Results> {
  const like = Q.like(`%${Q.sanitizeLikeString(term)}%`);
  try {
    const [clients, exercises, programs] = await Promise.all([
      database.get<ClientModel>('clients').query(Q.where('name', like), Q.take(PER_GROUP)).fetch(),
      database
        .get<ExerciseModel>('exercises')
        .query(Q.where('name', like), Q.take(PER_GROUP))
        .fetch(),
      database.get<ProgramModel>('programs').query(Q.where('name', like), Q.take(PER_GROUP)).fetch(),
    ]);
    return { clients, exercises, programs };
  } catch {
    return EMPTY;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 56,
    paddingHorizontal: space.inset,
  },
  field: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingTop: space.s2, paddingBottom: space.s8 },
  callout: { marginTop: space.s4 },
  group: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginTop: space.s5,
    marginBottom: space.s2,
  },
});
