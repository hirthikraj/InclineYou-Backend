/**
 * One client's programs.
 *
 * Not the program shelf (3a) — that is the trainer's library of templates, and
 * it lives behind the drawer. This is the list of plans that have actually been
 * put on *this person*, which is what every entry point into it is asking for:
 * the roster's "Change program", the diary's session sheet, the log's way in.
 *
 * Grouped by whether the plan is running. A trainer opening this screen is
 * either checking what somebody is on right now or looking back at what they
 * finished, and mixing the two into one date-sorted list answers neither
 * question. The current plan is one row, at the top, on its own.
 *
 * The way in to putting a *new* plan on somebody is the shelf, so the empty
 * state and the footer both point at it rather than offering a create form —
 * a program is a template copied onto a client, and inventing a second path
 * that skips the template would leave a plan nothing else in the app knows how
 * to reason about.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../navigation/MainStack';
import { observePrograms } from '../../db/programs';
import { observeClient } from '../../db/clients';
import type Program from '../../db/models/Program';
import {
  AppBar,
  Button,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconLayers,
  List,
  Reveal,
  Row,
  Skeleton,
  SkeletonRow,
  Tag,
  colors,
  space,
  type TagTone,
} from '../../design';

type Props = NativeStackScreenProps<MainStackParamList, 'ProgramList'>;

/**
 * Status as the trainer reads it, not as the column spells it.
 *
 * `active` is the accent because it is the one plan being trained today;
 * everything else is history and sits back.
 */
const STATUS: Record<string, { label: string; tone: TagTone }> = {
  active: { label: 'Running', tone: 'accent' },
  paused: { label: 'Paused', tone: 'warn' },
  completed: { label: 'Finished', tone: 'neutral' },
  cancelled: { label: 'Dropped', tone: 'neutral' },
};

/** '2026-08-15' → '15 Aug'. Blank strings are the model's null. */
function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Fat loss · 1 Jul → ongoing" — whichever halves of that exist. */
function summarise(program: Program): string | undefined {
  const from = day(program.startDate);
  const to = day(program.endDate);
  const span = from ? `${from} → ${to ?? 'ongoing'}` : to ? `until ${to}` : null;
  return [program.goal || null, span].filter(Boolean).join(' · ') || undefined;
}

export default function ProgramListScreen({ route, navigation }: Props) {
  const { clientId } = route.params;

  const [programs, setPrograms] = useState<Program[]>([]);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const sub = observePrograms(clientId).subscribe((next) => {
      setPrograms(next);
      setReady(true);
    });
    return () => sub.unsubscribe();
  }, [clientId]);

  // Only for the subtitle. A missing name is not worth blocking the list on,
  // so this never gates `ready`.
  useEffect(() => {
    const sub = observeClient(clientId).subscribe((client) => setName(client?.name ?? null));
    return () => sub.unsubscribe();
  }, [clientId]);

  const { running, past } = useMemo(() => {
    const r: Program[] = [];
    const p: Program[] = [];
    for (const program of programs) {
      (program.status === 'active' || program.status === 'paused' ? r : p).push(program);
    }
    return { running: r, past: p };
  }, [programs]);

  const openShelf = () => navigation.navigate('Programs');

  const row = (program: Program) => {
    const status = STATUS[program.status] ?? { label: program.status, tone: 'neutral' as TagTone };
    return (
      <Row
        key={program.id}
        grouped
        title={program.name || 'Untitled program'}
        subtitle={summarise(program)}
        dim={program.status === 'cancelled'}
        trailing={<Tag label={status.label} tone={status.tone} />}
        onPress={() => navigation.navigate('ProgramDetail', { programId: program.id })}
      />
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Programs"
          subtitle={name ?? undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <Reveal ready={ready} skeleton={<ProgramListSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {programs.length === 0 ? (
            <Empty
              icon={IconLayers}
              title="No program on them yet"
              body="Plans come off the shelf. Pick one there and assign it — the copy that lands here is theirs, and editing the template afterwards never touches it."
              action={<Button label="Open the shelf" icon={IconLayers} onPress={openShelf} />}
              style={styles.empty}
            />
          ) : (
            <>
              {running.length ? (
                <>
                  <GroupHead label="On now" count={running.length} />
                  <List style={styles.group}>{running.map(row)}</List>
                </>
              ) : null}

              {past.length ? (
                <>
                  <GroupHead label="Before this" count={past.length} />
                  <List style={styles.group}>{past.map(row)}</List>
                </>
              ) : null}

              <Button
                label="Assign another program"
                icon={IconLayers}
                variant="secondary"
                block
                onPress={openShelf}
                style={styles.assign}
              />
              <Text style={styles.fine}>
                Assigning copies a template onto them. Their old plans stay here — the history is
                the point of keeping them.
              </Text>
            </>
          )}
        </ScrollView>
      </Reveal>
    </SafeAreaView>
  );
}

function ProgramListSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading this client's programs">
      <Skeleton width={92} height={10} style={styles.headGap} />
      <List>
        <SkeletonRow grouped avatar={false} />
        <SkeletonRow grouped avatar={false} />
      </List>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  headGap: { marginTop: space.s5, marginBottom: space.s3 },
  group: { marginBottom: space.s2 },
  assign: { marginTop: space.s5 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  empty: { marginTop: space.s7 },
});
