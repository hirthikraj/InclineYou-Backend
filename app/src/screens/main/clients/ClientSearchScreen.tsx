/**
 * 2a–2c · Finding someone.
 *
 * Search is a screen, not a filter. On Home it hides behind an icon because
 * Home isn't a list; here, finding a person is the second reason anyone opens
 * the tab, so the field is permanent on the roster and tapping it pushes this —
 * Material 3's full-screen search view — because results span clients, groups
 * and programs and those can't be rendered inside a roster.
 *
 * An empty query shows recents and saved filters rather than a blank screen:
 * recents are what people actually want most of the time and they cost nothing
 * to render. A dead end gets a way out — add them, or widen to archived.
 * "No results" and nothing else is a bug, not a state.
 */

import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useRoster } from '../../../clients/useRoster';
import { matches, type Filters, type RosterRow } from '../../../clients/roster';
import {
  Avatar,
  Button,
  Chip,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconPlus,
  IconSearch,
  IconX,
  List,
  Pack,
  Row,
  Search,
  Seg,
  Tag,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/** Three is what fits above the keyboard without pushing the saved filters off. */
const RECENTS = 3;

const SAVED: { key: string; label: string; filters: Filters }[] = [
  { key: 'owes', label: 'Owes money', filters: { mode: [], money: ['owes'], batch: [] } },
  { key: 'remote', label: 'Remote', filters: { mode: ['remote'], money: [], batch: [] } },
  { key: 'morning', label: 'Morning batch', filters: { mode: [], money: [], batch: ['morning'] } },
];

export default function ClientSearchScreen() {
  const navigation = useNavigation<Nav>();
  const focused = useIsFocused();
  const roster = useRoster(focused);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const input = useRef<TextInput | null>(null);

  const term = query.trim();
  const savedFilter = SAVED.find((s) => s.key === saved);

  // A saved filter answers the same question a query does — "which of my
  // clients" — so it resolves into the same result list rather than bouncing
  // back to the roster with state the roster would have to be told about.
  const results = useMemo(() => {
    if (term) return roster.rows.filter((r) => matches(r, term));
    if (savedFilter) return roster.rows.filter((r) => savedMatches(r, savedFilter.filters));
    return [];
  }, [roster.rows, term, savedFilter]);

  /** Most recently trained. The proxy for "who was I just looking at". */
  const recents = useMemo(
    () =>
      [...roster.rows]
        .filter((r) => r.lastSessionAt)
        .sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))
        .slice(0, RECENTS),
    [roster.rows],
  );

  const open = (row: RosterRow) => navigation.navigate('ClientDetail', { clientId: row.id });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.bar}>
        <IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />
        <Search
          value={query}
          onChangeText={(next) => {
            setQuery(next);
            if (next) setSaved(null);
          }}
          placeholder="Search clients"
          autoFocus
          inputRef={input}
          style={styles.field}
          trailing={
            query.length > 0 || savedFilter ? (
              <IconButton
                icon={IconX}
                label="Clear search"
                bare
                size={14}
                onPress={() => {
                  setQuery('');
                  setSaved(null);
                }}
              />
            ) : undefined
          }
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {term.length === 0 && !savedFilter ? (
          <>
            {recents.length > 0 ? (
              <>
                <GroupHead label="Recent" />
                <List style={styles.list}>
                  {recents.map((row) => (
                    <ResultRow key={row.id} row={row} onPress={() => open(row)} />
                  ))}
                </List>
              </>
            ) : null}

            <GroupHead label="Saved filters" style={styles.spaced} />
            <Seg style={styles.saved}>
              {SAVED.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  count={roster.rows.filter((r) => savedMatches(r, s.filters)).length}
                  selected={saved === s.key}
                  onPress={() => setSaved(s.key)}
                />
              ))}
            </Seg>
          </>
        ) : results.length > 0 ? (
          <>
            <GroupHead label={savedFilter?.label ?? 'Clients'} count={results.length} />
            <List style={styles.list}>
              {results.map((row) => (
                <ResultRow key={row.id} row={row} query={term} onPress={() => open(row)} />
              ))}
            </List>
          </>
        ) : savedFilter ? (
          <Empty
            icon={IconSearch}
            title={`No ${savedFilter.label.toLowerCase()}`}
            body="Nobody matches this filter right now."
            style={styles.empty}
            action={<Button label="Back to search" variant="ghost" onPress={() => setSaved(null)} />}
          />
        ) : (
          <Empty
            icon={IconSearch}
            title={`No client called “${term}”`}
            body="Search covers names and phone numbers. Archived clients aren't included."
            style={styles.empty}
            action={
              <View style={styles.outs}>
                <Button
                  label={`Add ${term} as a client`}
                  size="lg"
                  block
                  icon={IconPlus}
                  onPress={() => navigation.navigate('AddClient')}
                />
                <Button
                  label="Search archived too"
                  variant="ghost"
                  block
                  onPress={() => navigation.navigate('Soon', { title: 'Archived clients' })}
                />
              </View>
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The saved filters are the same predicates the filter sheet applies. */
function savedMatches(row: RosterRow, f: Filters): boolean {
  if (f.mode.length > 0 && !f.mode.includes(row.mode)) return false;
  if (f.batch.length > 0 && !f.batch.includes(row.batch)) return false;
  if (f.money.includes('owes') && row.owed <= 0) return false;
  return true;
}

function ResultRow({
  row,
  query,
  onPress,
}: {
  row: RosterRow;
  query?: string;
  onPress: () => void;
}) {
  return (
    <Row
      grouped
      title={row.name}
      subtitle={row.line}
      leading={<Avatar name={row.name} size="sm" />}
      severity={row.severity}
      trailing={
        row.attention?.kind === 'quiet' ? (
          <Tag label="Quiet" tone="warn" />
        ) : row.owed > 0 ? (
          <Tag label="Owes" tone="danger" />
        ) : row.pack ? (
          <Pack remaining={row.pack.remaining} total={row.pack.total} />
        ) : (
          <Tag label="Paid" tone="ok" />
        )
      }
      highlight={query}
      onPress={onPress}
    />
  );
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
  scroll: { flex: 1 },
  body: { paddingBottom: space.s9 },
  list: { marginHorizontal: space.inset },
  spaced: { marginTop: space.s2 },
  saved: { paddingHorizontal: space.inset, marginTop: space.s2 },
  empty: { marginTop: 40 },
  outs: { gap: space.s2, width: 280 },
});
