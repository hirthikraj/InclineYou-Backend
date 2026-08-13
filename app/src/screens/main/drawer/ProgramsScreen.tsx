/**
 * 3a · Programs.
 *
 * Each program shows its **shape** as a weeks × days matrix rather than a name
 * and a count. Push / Pull / Legs / rest is legible at a glance, and shape is
 * what a trainer is actually choosing between — "8 weeks, 6 clients" says nothing
 * about whether it trains five days or three, or where the rest falls.
 *
 * The callout states the rule the whole category turns on: **a program is a
 * template, and assigning it copies it.** Both TrueCoach and Trainerize let a
 * template edit reach into a plan somebody was halfway through. Saying it on the
 * screen is cheap; the enforcement is in `db/training.ts` and on the server.
 *
 * What is refused here, and stated in the teardown: **building a twelve-week
 * program from scratch on a phone.** Train X shows, assigns and edits on mobile.
 * Authoring is a desk job, and pretending otherwise produces a bad program — so
 * the + offers to duplicate what exists rather than opening a blank builder.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useTraining } from '../../../training/useTraining';
import { buildPrograms } from '../../../training/training';
import { createTemplate, updateTemplate } from '../../../db/training';
import { useAuth } from '../../../store/AuthContext';
import RenameSheet from './RenameSheet';
import NewProgramSheet from './NewProgramSheet';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Chip,
  Empty,
  IconBack,
  IconButton,
  IconCopy,
  IconEdit,
  IconLayers,
  IconPlus,
  Menu,
  Reveal,
  Seg,
  Skeleton,
  Tag,
  Toast,
  WeekShape,
  colors,
  radius,
  space,
  type,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function ProgramsScreen() {
  const navigation = useNavigation<Nav>();
  const { input, ready } = useTraining();
  const { trainerId } = useAuth();

  const [filter, setFilter] = useState('all');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const view = useMemo(() => buildPrograms(input, filter), [input, filter]);
  const openCard = view.cards.find((c) => c.id === menuFor) ?? null;

  const rename = (name: string) => {
    const target = renaming;
    setRenaming(null);
    if (!target) return;
    void updateTemplate(target.id, { name })
      .then(() => setNotice('Renamed. Clients on it keep their copy.'))
      .catch(() => setNotice('Could not rename that.'));
  };

  const create = async (name: string, weeks: number | null) => {
    if (!trainerId) return;
    setCreating(false);
    try {
      const template = await createTemplate(trainerId, name, weeks);
      // Straight into it: a program with no exercises is not finished, and 3b's
      // empty state is where the next thing to do actually is.
      navigation.navigate('Program', { templateId: template.id });
    } catch {
      setNotice('Could not start that program.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Programs"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <IconButton
              icon={IconPlus}
              label="New program"
              bare
              onPress={() => setCreating(true)}
            />
          }
        />
      </View>

      <Reveal ready={ready} skeleton={<ProgramsSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {view.empty ? (
            <Empty
              icon={IconLayers}
              title="No programs yet"
              body="A program is a template you assign. Start one here, add exercises to its days, then assign it in two taps."
              action={
                <Button
                  label="Start one"
                  size="lg"
                  icon={IconPlus}
                  onPress={() => setCreating(true)}
                />
              }
              style={styles.empty}
            />
          ) : (
            <>
              <Seg style={styles.chips}>
                {view.chips.map((chip) => (
                  <Chip
                    key={chip.key}
                    label={chip.label}
                    count={chip.count}
                    selected={filter === chip.key}
                    onPress={() => setFilter(chip.key)}
                  />
                ))}
              </Seg>

              <View style={styles.stack}>
                {view.cards.map((card) => (
                  <Pressable
                    key={card.id}
                    onPress={() => navigation.navigate('Program', { templateId: card.id })}
                    onLongPress={() => setMenuFor(card.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.name}, ${card.meta}`}
                    style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                  >
                    <View style={styles.cardHead}>
                      <View style={styles.cardTitle}>
                        <Text style={styles.name} numberOfLines={2}>
                          {card.name} · {card.weeks} week{card.weeks === 1 ? '' : 's'}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {card.meta}
                        </Text>
                      </View>
                      {card.mostUsed ? <Tag label="Most used" tone="accent" /> : null}
                    </View>

                    <WeekShape week={card.week} legend={card.legend} style={styles.grid} />
                  </Pressable>
                ))}
              </View>

              <Callout icon={IconCopy} style={styles.note}>
                A program is a <CalloutStrong>template</CalloutStrong>. Assigning it copies it onto a
                client, so editing the template never changes a plan somebody is already halfway
                through.
              </Callout>
            </>
          )}
        </ScrollView>
      </Reveal>

      {/* Long-press actions. Duplicate and "who's on it" both go through the
          builder and the roster respectively — neither is a new screen. */}
      {openCard ? (
        <Pressable style={styles.menuLayer} onPress={() => setMenuFor(null)}>
          <Menu
            style={styles.menu}
            actions={[
              {
                key: 'open',
                label: 'Open it',
                icon: IconLayers,
                onPress: () => {
                  setMenuFor(null);
                  navigation.navigate('Program', { templateId: openCard.id });
                },
              },
              {
                key: 'rename',
                label: 'Rename',
                icon: IconEdit,
                onPress: () => {
                  setMenuFor(null);
                  setRenaming({ id: openCard.id, name: openCard.name });
                },
              },
              {
                key: 'who',
                label: openCard.clients ? `Who's on it · ${openCard.clients}` : 'Nobody on it yet',
                onPress: () => {
                  setMenuFor(null);
                  if (openCard.clients) navigation.navigate('Clients');
                  else setNotice('Assign it to somebody from inside the program.');
                },
              },
            ]}
          />
        </Pressable>
      ) : null}

      <RenameSheet
        visible={renaming !== null}
        title="Rename this program"
        meta="Clients already on it keep their own copy — only the shelf changes."
        current={renaming?.name ?? ''}
        onSave={rename}
        onClose={() => setRenaming(null)}
      />

      <NewProgramSheet
        visible={creating}
        onCreate={(name, weeks) => void create(name, weeks)}
        onClose={() => setCreating(false)}
      />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/** Two cards at the real card height, so nothing shifts when the shelf lands. */
function ProgramsSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading your programs">
      <Seg style={styles.chips}>
        <Skeleton width={58} height={34} round={radius.full} />
        <Skeleton width={86} height={34} round={radius.full} />
        <Skeleton width={92} height={34} round={radius.full} />
      </Seg>
      <View style={styles.stack}>
        <Skeleton height={150} round={radius.r2} />
        <Skeleton height={150} round={radius.r2} />
        <Skeleton height={150} round={radius.r2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  chips: { marginTop: space.s3 },
  stack: { marginTop: space.s4, gap: space.cardGap },

  card: {
    borderRadius: radius.r2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.cardPad,
  },
  pressed: { backgroundColor: colors.surface2 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, marginBottom: space.s3 },
  cardTitle: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.26, color: colors.ink },
  meta: { fontSize: 12, color: colors.ink3, marginTop: 3 },
  grid: {},

  note: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },

  menuLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, justifyContent: 'center' },
  menu: { alignSelf: 'center' },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
