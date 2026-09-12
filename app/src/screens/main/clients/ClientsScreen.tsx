/**
 * Screen 04 · Clients.
 *
 * `agent/design system/screens/inclineyouclients.html`.
 *
 * The teardown of nine coaching platforms produced one agreement and one blind
 * spot. They all compute who needs attention rather than asking the trainer to
 * remember — Trainerize's auto-tags are the best version of it — and every
 * single one of them puts the money on another screen. For a trainer selling
 * ten-session packs for cash and UPI, who owes you *is* the roster. So the list
 * opens on Needs attention, the amount is on the row, and A–Z is one tap away.
 *
 * Three ways into an action and none of them is the only way (NN/g): the swipe
 * carries the one obvious verb for that row's state, the long-press menu
 * carries all of them, and the client's own screen carries them again.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useShell } from '../../../navigation/AppShell';
import { useRoster } from '../../../clients/useRoster';
import {
  INDEX_RAIL_MIN,
  NO_FILTERS,
  SEGMENTS,
  filterCount,
  inSegment,
  passesFilters,
  sectionRows,
  sortRows,
  type Filters,
  type RosterRow,
  type RosterSection,
  type Segment,
  type SortKey,
} from '../../../clients/roster';
import { setClientStatus } from '../../../db/clients';
import { dismissSyncNotice, syncDatabase } from '../../../db/sync';
import { useSyncState } from '../../../db/useSync';
import { rupeesShort } from '../../../home/time';
import {
  AppBar,
  Avatar,
  Banner,
  Button,
  Callout,
  CalloutStrong,
  Check,
  ChoiceSlot,
  Chip,
  Empty,
  GroupHead,
  IconButton,
  IconChart,
  IconCheck,
  IconChevron,
  IconCloudOff,
  IconDots,
  IconDumbbell,
  IconFilter,
  IconInbox,
  IconLayers,
  IconMenu,
  IconCalendar,
  IconMessage,
  IconPause,
  IconRupee,
  IconSend,
  IconSort,
  IconUserAdd,
  IconUsers,
  IconWallet,
  IconX,
  IndexRail,
  Pack,
  Reveal,
  Row,
  Search,
  SelectBar,
  SwipeRow,
  SyncSpinner,
  Tag,
  Tally,
  Toast,
  colors,
  space,
} from '../../../design';
import SortSheet from './SortSheet';
import FilterSheet from './FilterSheet';
import RosterSkeleton from './RosterSkeleton';
import RowMenu, { type RowMenuKey } from './RowMenu';
import BulkMessageSheet from './BulkMessageSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/** What the roster knows about a client the app can't message. */
const NO_PHONE = 'No phone number saved for this client.';

export default function ClientsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const shell = useShell();
  const focused = useIsFocused();
  const roster = useRoster(focused);
  const sync = useSyncState();
  const network = useNetworkState();

  const [segment, setSegment] = useState<Segment>('all');
  const [sort, setSort] = useState<SortKey>('attention');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuRow, setMenuRow] = useState<RosterRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useRef<SectionList<RosterRow, RosterSection>>(null);
  const selecting = selected.length > 0;
  // Destructured because `shell` is a new object whenever any of its flags
  // change — depending on it here would make the focus cleanup below undo the
  // effect above on every toggle.
  const { setChromeHidden } = shell;

  const offline = network.isConnected === false || network.isInternetReachable === false;

  // One at a time — two refusals are two taps, not a wall of text over the list.
  const refusal = sync.notices[0] ?? null;

  // An empty local roster means one of two things: nobody exists, or this is a
  // fresh install whose first pull hasn't landed yet — and only one outcome
  // tells them apart: a pull that actually SUCCEEDED this launch. A failed
  // attempt proves nothing — the startup sync can lose a race with the network
  // or the token coming up, and counting that error as an answer put "your
  // roster is empty" on screen while the retry that would load eight clients
  // was seconds away. Never mid-sync, and never on the phone's own network
  // guess — expo-network reads "unreachable" for the first moments of a
  // launch. A roster with rows never waits: it paints from SQLite first, which
  // is this screen's opening rule.
  const syncConfirmed = sync.phase !== 'syncing' && sync.lastSyncedAt !== null;

  // One beat between the pull landing and believing an empty roster: the rows
  // a sync writes reach this screen through observables that re-query
  // asynchronously, so right after `lastSyncedAt` flips the roster can still
  // read empty while the clients are already in SQLite.
  const [emptyStands, setEmptyStands] = useState(false);
  useEffect(() => {
    if (!(roster.ready && roster.firstRun && syncConfirmed)) {
      setEmptyStands(false);
      return;
    }
    const t = setTimeout(() => setEmptyStands(true), 400);
    return () => clearTimeout(t);
  }, [roster.ready, roster.firstRun, syncConfirmed]);

  const settled = roster.ready && (!roster.firstRun || emptyStands);

  /* ------------------------------------------------------------------ rows */

  const inSegmentRows = useMemo(
    () => roster.rows.filter((r) => inSegment(r, segment)),
    [roster.rows, segment],
  );

  const visible = useMemo(
    () => sortRows(inSegmentRows.filter((r) => passesFilters(r, filters)), sort),
    [inSegmentRows, filters, sort],
  );

  const sections = useMemo(() => {
    const built = sectionRows(visible, sort, segment);
    return built.map((s) => (collapsed[s.key] ? { ...s, data: [] } : s));
  }, [visible, sort, segment, collapsed]);

  // § 07: the rail only renders when the list is sorted A–Z, because an index
  // into an urgency-sorted list points at nothing.
  const letters = useMemo(
    () =>
      sort === 'name' && visible.length >= INDEX_RAIL_MIN
        ? Array.from(new Set(visible.map((r) => r.letter)))
        : [],
    [sort, visible],
  );

  /* ------------------------------------------------------------- selection */

  const clearSelection = useCallback(() => setSelected([]), []);

  // The nav bar stands down while a selection is live, and comes back on the
  // way out — including when the screen is left mid-selection.
  useEffect(() => {
    setChromeHidden(selecting);
  }, [selecting, setChromeHidden]);

  // Leaving the roster ends the selection. Restoring the nav bar without also
  // dropping the selection leaves the screen half in a mode it can't show.
  useFocusEffect(
    useCallback(
      () => () => {
        setChromeHidden(false);
        setSelected([]);
      },
      [setChromeHidden],
    ),
  );

  const toggleSelect = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const selectedRows = useMemo(
    () => visible.filter((r) => selected.includes(r.id)),
    [visible, selected],
  );

  /* --------------------------------------------------------------- actions */

  const openClient = (row: RosterRow) => navigation.navigate('ClientDetail', { clientId: row.id });

  const whatsapp = async (row: RosterRow, text: string) => {
    if (!row.phone) {
      setNotice(NO_PHONE);
      return;
    }
    const url = `https://wa.me/${row.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice('Could not open WhatsApp on this phone.');
    }
  };

  /** The one verb the row's state implies — the swipe and the row button share it. */
  const runVerb = (row: RosterRow) => {
    const first = row.name.split(/\s+/)[0] ?? row.name;
    switch (row.attention?.kind) {
      // Straight back into the onboarding step still owed — the same screens
      // the add flow runs, resumed with whatever was already answered.
      case 'setup':
        navigation.navigate(row.setupStep === 'plan' ? 'ClientPlan' : 'ClientSchedule', {
          clientId: row.id,
        });
        return;
      case 'overdue':
        void whatsapp(row, `Hi ${first}, a payment is pending for your pack.`);
        return;
      case 'quiet':
        void whatsapp(row, `Hi ${first}, haven't seen you log this week — everything alright?`);
        return;
      case 'pack':
        navigation.navigate('PackageList', { clientId: row.id, clientName: row.name });
        return;
      case 'invite':
        void whatsapp(row, `Hi ${first}, here's your InclineYou invite again.`);
        return;
      // The only attention item whose fix is an edit rather than a message.
      // Straight to the form the number lives on — there is nothing to say to
      // the client, and nothing they could do about it.
      case 'unavailable':
        navigation.navigate('EditClient', { clientId: row.id });
        return;
      default:
        if (row.status === 'paused') void resume(row);
        else openClient(row);
    }
  };

  const resume = async (row: RosterRow) => {
    try {
      await setClientStatus(row.id, 'active');
      setNotice(`${row.name} is back on your roster.`);
    } catch {
      setNotice('Could not resume this client.');
    }
  };

  const onMenu = (key: RowMenuKey, row: RosterRow) => {
    setMenuRow(null);
    switch (key) {
      case 'remind':
        runVerb(row);
        return;
      case 'payment':
        navigation.navigate('PackageList', { clientId: row.id, clientName: row.name });
        return;
      case 'session':
        navigation.navigate('Home', {
          screen: 'DiaryTab',
          params: { book: true, clientId: row.id },
        } as never);
        return;
      case 'program':
        navigation.navigate('ProgramList', { clientId: row.id });
        return;
      case 'select':
        setSelected([row.id]);
        return;
      case 'resume':
        void resume(row);
        return;
      case 'pause':
        Alert.alert(
          `Pause ${row.name}?`,
          'They keep their history and their pack, and stop seeing new sessions until you resume them.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Pause',
              onPress: () => {
                void setClientStatus(row.id, 'paused').then(() =>
                  setNotice(`${row.name} is paused.`),
                );
              },
            },
          ],
        );
        return;
      case 'archive':
        Alert.alert(
          `Archive ${row.name}?`,
          'Archiving closes their pack. Their history is kept and you can restore them later.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Archive',
              style: 'destructive',
              onPress: () => {
                void setClientStatus(row.id, 'archived').then(() =>
                  setNotice(`${row.name} archived.`),
                );
              },
            },
          ],
        );
    }
  };

  /* ------------------------------------------------------------- tab press */

  const atTop = useRef(true);
  useEffect(() => {
    const unsubscribe = (
      navigation as unknown as { addListener: (e: string, cb: () => void) => () => void }
    ).addListener('tabPress', () => {
      // § 04: scroll to top, then clear filters on a second tap.
      if (!atTop.current) {
        list.current?.scrollToLocation({
          sectionIndex: 0,
          itemIndex: 0,
          animated: true,
          viewPosition: 0,
        });
        return;
      }
      if (filterCount(filters) > 0 || segment !== 'all') {
        setFilters(NO_FILTERS);
        setSegment('all');
        setNotice('Filters cleared.');
      }
    });
    return unsubscribe;
  }, [navigation, filters, segment]);

  /* ---------------------------------------------------------------- header */

  // Every branch below counts something, and a count of zero before the tables
  // have been read is a statement, not a placeholder. No subtitle at all until
  // there is one worth printing.
  const subtitle = !settled
    ? undefined
    : roster.firstRun
    ? 'No clients yet'
    : offline
      ? `${roster.counts.active} active · showing local copy`
      : segment === 'attention'
        ? `${roster.counts.attention} need you today`
        : [
            `${roster.counts.active} active`,
            roster.paused > 0 ? `${roster.paused} paused` : null,
          ]
            .filter(Boolean)
            .join(' · ');

  const header = (
    <View style={styles.header}>
      {offline ? (
        <Banner
          tone="offline"
          icon={IconCloudOff}
          style={styles.banner}
          onPress={() => navigation.navigate('SyncQueue')}
        >
          {`Offline — your roster is stored on this phone.${
            sync.pendingCount > 0 ? ` ${sync.pendingCount} changes waiting.` : ''
          }`}
        </Banner>
      ) : null}

      {/* A field that pushes a screen rather than filtering in place (§ 02):
          results span clients, groups and programs and can't live in a roster. */}
      {selecting ? null : (
        <Search
          value=""
          onChangeText={() => {}}
          placeholder="Search clients"
          style={styles.search}
          onPress={() => navigation.navigate('ClientSearch')}
        />
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipRow}
      >
        <SectionChips
          // Same rule as the subtitle: "ALL 0 · ACTIVE 0" across a roster of
          // eight is the exact wrong first impression.
          counts={settled ? roster.counts : undefined}
          value={segment}
          onPick={(next) => {
            setSegment(next);
            clearSelection();
          }}
          filters={filterCount(filters)}
          onFilter={() => setFilterOpen(true)}
        />
      </ScrollView>

      {segment === 'attention' && visible.length > 0 && settled ? (
        <Tally
          style={styles.tally}
          items={[
            {
              key: 'owed',
              value: rupeesShort(roster.tally.owed),
              label: 'owed',
              tone: 'warn',
              onPress: () => setFilters({ ...NO_FILTERS, money: ['owes'] }),
            },
            { key: 'quiet', value: String(roster.tally.quiet), label: 'quiet' },
            {
              key: 'ending',
              value: String(roster.tally.ending),
              label: 'ending',
              onPress: () => setFilters({ ...NO_FILTERS, money: ['ending'] }),
            },
          ]}
        />
      ) : null}

      {segment === 'paused' && roster.paused > 0 ? (
        <Callout icon={IconPause} style={styles.callout}>
          Paused clients keep their history and their pack. They can't see new sessions until you
          resume them.
        </Callout>
      ) : null}

      {segment === 'invited' && roster.counts.invited > 0 ? (
        <Callout icon={IconUsers} style={styles.callout}>
          You can log sessions and take payments for an invited client straight away.{' '}
          <CalloutStrong>The invite only controls whether they see the app.</CalloutStrong>
        </Callout>
      ) : null}
    </View>
  );

  /* ---------------------------------------------------------------- footer */

  const footer = (
    <View style={styles.footer}>
      {segment === 'paused' && roster.archived > 0 ? (
        <>
          <GroupHead label="Archived" count={roster.archived} style={styles.bleed} />
          <Row
            title="Archived clients"
            subtitle="Kept for your records · not counted in your plan"
            leading={<IconInbox size={20} color={colors.ink3} />}
            trailing={<IconChevron size={18} color={colors.ink3} />}
            onPress={() => navigation.navigate('Soon', { title: 'Archived clients' })}
          />
        </>
      ) : null}

      {segment === 'invited' && roster.counts.invited > 0 ? (
        <>
          <GroupHead label="What they get" style={styles.bleed} />
          <View style={styles.gets}>
            <Row
              title="Their workouts"
              subtitle="Sessions you've logged and what's next"
              minHeight={54}
              leading={<IconDumbbell size={19} color={colors.ink3} />}
            />
            <Row
              title="Their progress"
              subtitle="PRs, weight, adherence"
              minHeight={54}
              leading={<IconChart size={19} color={colors.ink3} />}
            />
            <Row
              title="Their pack"
              subtitle="Sessions left and what's paid"
              minHeight={54}
              leading={<IconWallet size={19} color={colors.ink3} />}
            />
          </View>
        </>
      ) : null}
    </View>
  );

  /* ------------------------------------------------------------------ rows */

  const renderRow = (row: RosterRow) => {
    const verb = row.attention?.action ?? (row.status === 'paused' ? 'Resume' : null);

    const body = (
      <Row
        grouped
        title={row.name}
        subtitle={row.line}
        // In selection mode the checkbox takes the avatar's slot so nothing
        // shifts horizontally and the eye keeps its place (§ 07).
        leading={
          selecting ? (
            <ChoiceSlot>
              <Check checked={selected.includes(row.id)} />
            </ChoiceSlot>
          ) : (
            <Avatar name={row.name} size="sm" />
          )
        }
        severity={row.severity}
        selected={selected.includes(row.id)}
        trailing={<Trailing row={row} verb={verb} selecting={selecting} onVerb={() => runVerb(row)} />}
        onPress={() => (selecting ? toggleSelect(row.id) : openClient(row))}
        onLongPress={() => {
          if (selecting) toggleSelect(row.id);
          else setMenuRow(row);
        }}
      />
    );

    if (selecting || !row.attention) return body;

    return (
      <SwipeRow
        severity={row.severity}
        action={{
          label: row.attention.action,
          icon:
            row.attention.kind === 'overdue'
              ? IconRupee
              : row.attention.kind === 'setup'
                ? IconCalendar
                : IconMessage,
          tone: row.attention.kind === 'overdue' ? 'pay' : 'nudge',
        }}
        onAction={() => runVerb(row)}
      >
        {body}
      </SwipeRow>
    );
  };

  /* ---------------------------------------------------------------- render */

  // Fresh install, nothing pulled yet: the only honest things to show are the
  // sync doing its work, or the reason it can't. Never the empty roster and
  // never skeleton rows — the first reads as "your clients are gone" to a
  // trainer who has eight, the second promises rows we cannot promise. The
  // add action stays in the bar throughout: a genuinely new trainer, online or
  // not, is never blocked from their first client.
  if (roster.ready && roster.firstRun && !settled) {
    const failed = sync.phase === 'error';
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.pad}>
          <AppBar
            title="Clients"
            subtitle={failed ? 'Offline' : 'Syncing…'}
            leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
            actions={
              <IconButton
                icon={IconUserAdd}
                label="Add client"
                bare
                onPress={() => navigation.navigate('AddClient')}
              />
            }
          />
        </View>
        {failed ? (
          <Empty
            icon={IconCloudOff}
            title="Couldn't reach InclineYou"
            body="This phone hasn't finished its first sync, so your roster isn't here yet. Check your connection and try again."
            style={styles.firstRun}
            action={<Button label="Try again" onPress={() => void syncDatabase('retry')} />}
          />
        ) : (
          <View style={styles.firstPull} accessibilityLiveRegion="polite">
            <SyncSpinner size={26} />
            <Text style={styles.firstPullText}>Syncing your clients…</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // `settled` guards every empty state on this screen. Before the first local
  // emission — and, on a fresh install, before the first pull has had its say —
  // the roster is empty because nothing has been read yet, not because there
  // is nobody. "Your roster is empty" is the wrong thing to say to a trainer
  // with eight clients, even for one frame.
  if (roster.firstRun && settled) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.pad}>
          <AppBar
            title="Clients"
            subtitle="No clients yet"
            leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
            actions={
              <IconButton
                icon={IconUserAdd}
                label="Add client"
                bare
                onPress={() => navigation.navigate('AddClient')}
              />
            }
          />
          <Empty
            icon={IconUsers}
            title="Your roster is empty"
            body="A client needs a name and a phone number. Everything else — program, pack, payments — you can add later."
            style={styles.firstRun}
            action={
              <Button
                label="Add a client"
                size="lg"
                icon={IconUserAdd}
                onPress={() => navigation.navigate('AddClient')}
              />
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.pad}>
        {selecting ? (
          <SelectBar
            count={selected.length}
            leading={
              <IconButton icon={IconX} label="Cancel selection" bare onPress={clearSelection} />
            }
            action={{
              label: 'All',
              icon: IconCheck,
              onPress: () => setSelected(visible.map((r) => r.id)),
            }}
          />
        ) : (
          <AppBar
            title="Clients"
            subtitle={subtitle}
            leading={<IconButton icon={IconMenu} label="Menu" bare onPress={shell.openDrawer} />}
            actions={
              <>
                <IconButton icon={IconSort} label="Sort" bare onPress={() => setSortOpen(true)} />
                <IconButton
                  icon={IconUserAdd}
                  label="Add client"
                  bare
                  onPress={() => navigation.navigate('AddClient')}
                />
              </>
            }
          />
        )}
      </View>

      <View style={styles.listWrap}>
        {/* The search pill and the chips live in the list's header, so the whole
            body — header included — crosses over together, and the skeleton's
            own pill and chips sit at exactly those positions underneath. */}
        {/* `fill`, so the list below is given a bounded height. Without it the
            animated wrapper sizes to its content and the SectionList renders
            every row instead of a window. */}
        <Reveal ready={settled} skeleton={<RosterSkeleton />} fill style={styles.reveal}>
        <SectionList
          ref={list}
          sections={sections}
          keyExtractor={(row) => row.id}
          stickySectionHeadersEnabled
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            !settled ? null : (
            <Empty
              icon={IconUsers}
              title="Nobody here"
              body={
                filterCount(filters) > 0
                  ? 'No client matches these filters.'
                  : `No clients in ${SEGMENTS.find((s) => s.key === segment)?.label ?? 'this list'}.`
              }
              action={
                filterCount(filters) > 0 ? (
                  <Button label="Clear filters" variant="ghost" onPress={() => setFilters(NO_FILTERS)} />
                ) : undefined
              }
            />
            )
          }
          renderSectionHeader={({ section }) =>
            section.label ? (
              <GroupHead
                label={section.label}
                count={section.count}
                tone={section.tone}
                collapsed={Boolean(collapsed[section.key])}
                onPress={() =>
                  setCollapsed((c) => ({ ...c, [section.key]: !c[section.key] }))
                }
              />
            ) : null
          }
          renderItem={({ item, index, section }) => (
            <View
              style={[
                styles.rowWrap,
                index === 0 && styles.rowFirst,
                index === section.data.length - 1 && styles.rowLast,
              ]}
            >
              {renderRow(item)}
            </View>
          )}
          onScroll={(e) => {
            atTop.current = e.nativeEvent.contentOffset.y <= 4;
          }}
          scrollEventThrottle={64}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        />
        </Reveal>

        {letters.length > 0 ? (
          <IndexRail
            letters={letters}
            onScrub={(letter) => {
              const at = sections.findIndex((s) => s.key === letter);
              if (at < 0) return;
              list.current?.scrollToLocation({
                sectionIndex: at,
                itemIndex: 0,
                animated: false,
                viewPosition: 0,
              });
            }}
          />
        ) : null}
      </View>

      {selecting ? (
        <View style={[styles.selectActions, { paddingBottom: space.s3 + insets.bottom }]}>
          <Button
            label={`Message ${selected.length}`}
            icon={IconSend}
            style={styles.grow}
            onPress={() => setBulkOpen(true)}
          />
          <IconButton
            icon={IconLayers}
            label="Assign program"
            onPress={() => {
              const first = selectedRows[0];
              if (first) navigation.navigate('ProgramList', { clientId: first.id });
            }}
          />
          <IconButton
            icon={IconDots}
            label="More"
            onPress={() => navigation.navigate('Soon', { title: 'More bulk actions' })}
          />
        </View>
      ) : null}

      <SortSheet
        visible={sortOpen}
        value={sort}
        onPick={setSort}
        onClose={() => setSortOpen(false)}
      />
      <FilterSheet
        visible={filterOpen}
        rows={inSegmentRows}
        value={filters}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />
      <RowMenu row={menuRow} onPick={onMenu} onClose={() => setMenuRow(null)} />
      <BulkMessageSheet
        visible={bulkOpen}
        rows={selectedRows}
        onClose={() => setBulkOpen(false)}
        onSent={(opened, skipped) => {
          clearSelection();
          setNotice(
            skipped > 0
              ? `${opened} chats opened · ${skipped} skipped, no phone number`
              : `${opened} chat${opened === 1 ? '' : 's'} opened.`,
          );
        }}
      />

      {/* A refusal outranks anything this screen has to say for itself: the
          client it names has just been taken off the phone, and the roster is
          where the trainer would go looking for them. */}
      {refusal ? (
        <Toast
          style={styles.toast}
          action={{ label: 'Got it', onPress: () => dismissSyncNotice(refusal.id) }}
        >
          {refusal.message}
        </Toast>
      ) : notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------------- fragments */

function SectionChips({
  counts,
  value,
  onPick,
  filters,
  onFilter,
}: {
  /** Absent until the roster has been read — a chip with no number, not a zero. */
  counts?: Record<Segment, number>;
  value: Segment;
  onPick: (next: Segment) => void;
  filters: number;
  onFilter: () => void;
}) {
  return (
    <>
      {SEGMENTS.map((s) => (
        <Chip
          key={s.key}
          label={s.label}
          count={counts?.[s.key]}
          selected={value === s.key}
          onPress={() => onPick(s.key)}
        />
      ))}
      <Chip label="Filter" icon={IconFilter} badge={filters} onPress={onFilter} />
    </>
  );
}

function Trailing({
  row,
  verb,
  selecting,
  onVerb,
}: {
  row: RosterRow;
  verb: string | null;
  selecting: boolean;
  onVerb: () => void;
}) {
  if (row.queued) return <Tag label="Queued" tone="info" />;
  // A list with no verb is a report (§ 01) — but a verb inside a selection is a
  // second target competing with the checkbox.
  if (verb && !selecting) return <Button label={verb} size="sm" variant="ghost" onPress={onVerb} />;
  // Ahead of "Invited", because a client who can never be invited must not be
  // labelled as one — that tag is the exact wrong thing to tell the trainer here.
  if (row.attention?.kind === 'unavailable') return <Tag label="Can't invite" tone="warn" />;
  if (row.status === 'invited') return <Tag label="Invited" tone="info" />;
  if (row.pack) return <Pack remaining={row.pack.remaining} total={row.pack.total} />;
  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  listWrap: { flex: 1 },
  // The reveal wrapper has to fill the same space the list did.
  reveal: { flex: 1 },
  body: { paddingBottom: space.s9 },

  header: { paddingHorizontal: space.inset, paddingBottom: space.s1 },
  banner: { marginBottom: space.s2 },
  search: { marginTop: 6 },
  chipRow: { marginTop: space.s3, marginHorizontal: -space.inset },
  chips: { flexDirection: 'row', gap: space.s2, paddingHorizontal: space.inset },
  tally: { marginTop: space.s4 },
  callout: { marginTop: space.s4 },

  // Rows carry the gutter; the sticky header spans the full width so its band
  // of canvas reaches both edges.
  rowWrap: {
    marginHorizontal: space.inset,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden' },
  rowLast: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, overflow: 'hidden' },

  footer: { paddingHorizontal: space.inset, paddingTop: space.s4 },
  bleed: { marginHorizontal: -space.inset },
  gets: { gap: space.s1 },

  firstRun: { marginTop: 44 },

  // Sits a touch above true centre — under the app bar the optical middle of
  // the remaining canvas is higher than the geometric one.
  firstPull: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 88 },
  firstPullText: { fontSize: 13, fontWeight: '500', color: colors.ink3 },

  selectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s2,
    paddingHorizontal: space.s4,
    paddingTop: space.s2,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  grow: { flex: 1 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
