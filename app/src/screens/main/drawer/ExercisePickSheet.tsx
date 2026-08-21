/**
 * Pick an exercise from what this phone already holds.
 *
 * Reads the local `exercises` table, which is the seeded library plus every
 * custom exercise in the caller's team (team customs ride sync — see
 * `SyncService.fetchExercises`). So this works with no signal even though the
 * plan it is adding to lives online: the *choice* is offline, the write is not,
 * and separating them means the picker never sits blank waiting for a request.
 *
 * Search rather than the full library screen. 1,324 rows behind a sheet is a
 * scroll nobody finishes, and an admin adjusting somebody else's Tuesday already
 * knows the name of the thing they want.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../db';
import type ExerciseModel from '../../../db/models/Exercise';
import { Avatar, Empty, IconDumbbell, List, Row, Search, Sheet, Tag, colors, space } from '../../../design';

export interface PickedExercise {
  id: string;
  name: string;
}

export interface ExercisePickSheetProps {
  visible: boolean;
  title?: string;
  onPick: (exercise: PickedExercise) => void;
  onClose: () => void;
}

interface Option extends PickedExercise {
  muscleGroup: string | null;
  custom: boolean;
}

export default function ExercisePickSheet({
  visible,
  title = 'Add an exercise',
  onPick,
  onClose,
}: ExercisePickSheetProps) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<Option[]>([]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      return;
    }
    let alive = true;
    // Read once per open rather than subscribing: the library does not change
    // while a sheet is open, and a standing subscription over 1,324 rows behind a
    // modal is rent with no tenant.
    void database
      .get<ExerciseModel>('exercises')
      .query(Q.sortBy('name', Q.asc))
      .fetch()
      .then((rows) => {
        if (!alive) return;
        setAll(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            muscleGroup: row.muscleGroup ?? null,
            custom: row.isCustom,
          })),
        );
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Unsearched, the sheet shows the team's own exercises rather than the first
    // 40 of the alphabet: a custom exercise is one somebody in the team made on
    // purpose, which makes it the likelier pick.
    if (!needle) return all.filter((option) => option.custom).slice(0, 40);
    return all
      .filter(
        (option) =>
          option.name.toLowerCase().includes(needle) ||
          (option.muscleGroup ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [all, query]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Search value={query} onChangeText={setQuery} placeholder="Search exercises" />

      {results.length === 0 ? (
        <Empty
          icon={IconDumbbell}
          title={query ? 'Nothing matches' : 'No team exercises yet'}
          body={query ? 'Try a different word.' : 'Search the library to find one.'}
          compact
          style={styles.empty}
        />
      ) : (
        <List style={styles.list}>
          {results.map((option) => (
            <Row
              key={option.id}
              grouped
              leading={<Avatar name={option.name} size="sm" square />}
              title={option.name}
              subtitle={option.muscleGroup || undefined}
              trailing={option.custom ? <Tag label="Team" tone="accent" /> : undefined}
              onPress={() => onPick({ id: option.id, name: option.name })}
            />
          ))}
        </List>
      )}

      <Text style={styles.hint}>
        The whole library is here, plus every custom exercise anyone in your team has made.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: space.s3, maxHeight: 320 },
  empty: { marginTop: space.s4 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.ink3, marginTop: space.s3 },
});
