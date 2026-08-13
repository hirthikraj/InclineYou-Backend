/**
 * 6a–6d · The client file.
 *
 * `agent/design system/screens/xrep-clients.html` § 09.
 *
 * This is the screen every "tap a client" in the app has been pointing at. One
 * record, four views — **overview, programs, sessions, package** — and the
 * ledger drawn on the Money screen as their book sits one tap inside the Package
 * tab rather than becoming a fifth tab. Four already scroll horizontally at
 * 360dp; the design system's tab scroller exists because four overflowed.
 *
 * A pushed screen with no bottom bar: a back arrow returns to the roster, which
 * is where a trainer's attention lives.
 *
 * The rule the competitors break, and the one that decides this file's shape:
 * **every figure on the overview is a link to the screen that owns it.** A
 * number a trainer can't tap is a number they have to leave the file to chase —
 * and routing off `row.link` is also what guarantees one source per figure,
 * because the owed pair here is literally the pair from their book.
 *
 * The app bar carries no name: the header block is the title, and on scroll it
 * collapses and the name takes the bar's slot. That is why the bar looks empty.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useClientFile } from '../../../clients/useClientFile';
import {
  FILE_TABS,
  buildHead,
  buildOverview,
  buildPackage,
  buildPrograms,
  buildSessions,
  type FigureLink,
  type FileTab,
  type SessionFilter,
} from '../../../clients/file';
import { whatsappUri } from '../../../money/money';
import {
  AppBar,
  Bar,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Chip,
  ClientHead,
  Empty,
  Figures,
  IconBack,
  IconButton,
  IconCalendar,
  IconChart,
  IconDots,
  IconLayers,
  IconMessage,
  IconRupee,
  Kv,
  KvRow,
  Legend,
  List,
  Row,
  RowTime,
  SectionHead,
  Tabs,
  Skeleton,
  Streak,
  Tag,
  Timeline,
  TimelineItem,
  colors,
  space,
  tnum,
} from '../../../design';
import FileMenu from './FileMenu';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'ClientDetail'>;

/** Where the header block has fully collapsed and the name owns the app bar. */
const COLLAPSE = 56;

export default function ClientFileScreen() {
  const navigation = useNavigation<Nav>();
  const { clientId } = useRoute<Rt>().params;
  const focused = useIsFocused();
  const { input, now, ready } = useClientFile(clientId, focused);

  const [tab, setTab] = useState<FileTab>('overview');
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const head = useMemo(() => buildHead(input, now), [input, now]);
  const overview = useMemo(() => buildOverview(input, now), [input, now]);
  const programs = useMemo(() => buildPrograms(input, now), [input, now]);
  const sessions = useMemo(() => buildSessions(input, now, filter), [input, now, filter]);
  const pack = useMemo(() => buildPackage(input, now), [input, now]);

  /** § 12's tap map, in one place: a figure knows its destination, not its route. */
  const follow = useCallback(
    (link: FigureLink, targetId?: string) => {
      if (!link) return;
      if (link === 'book') navigation.navigate('MoneyBook', { clientId });
      else if (link === 'package') setTab('package');
      else if (link === 'adherence') navigation.navigate('Adherence');
      else if (link === 'metrics') navigation.navigate('BodyMetrics', { clientId });
      else if (link === 'session' && targetId)
        navigation.navigate('SessionDetail', { sessionId: targetId });
      // The tap map asks for this workout read-only. The log has no read-only
      // mode yet and inventing one belongs to the workout-log design file, not
      // this one — so it opens the log itself, which is the same record.
      else if (link === 'workout' && targetId)
        navigation.navigate('WorkoutLog', { workoutId: targetId });
    },
    [navigation, clientId],
  );

  if (!head) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.pad}>
          <AppBar
            title="Clients"
            leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          />
          {ready ? (
            <Empty
              icon={IconChart}
              title="That client isn't here any more"
              body="They may have been removed on another device. The roster is up to date."
              style={styles.gone}
            />
          ) : (
            <View style={styles.loading}>
              <Skeleton height={72} />
              <Skeleton height={132} style={styles.loadingGap} />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const first = head.name.split(' ')[0] || head.name;
  const message = () => {
    // No template. A reminder about money is composed in the money flow, never
    // here — this icon opens the chat and gets out of the way.
    const uri = whatsappUri(head.phone, '');
    if (uri) void Linking.openURL(uri);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={collapsed ? head.name : 'Clients'}
          subtitle={collapsed ? head.statusLabel : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            <>
              <IconButton
                icon={IconMessage}
                label={`Message ${first} on WhatsApp`}
                bare
                onPress={message}
              />
              <IconButton icon={IconDots} label="More" bare onPress={() => setMenu(true)} />
            </>
          }
        />
      </View>

      <Animated.ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e) => {
            // @ts-expect-error — RN types the listener's event loosely.
            const y = e.nativeEvent.contentOffset.y as number;
            setCollapsed((was) => (was ? y > COLLAPSE - 12 : y > COLLAPSE));
          },
        })}
      >
        <ClientHead
          name={head.name}
          paused={head.status === 'paused'}
          phone={head.phoneLabel ?? undefined}
          tags={
            <>
              <Tag
                label={head.mode === 'remote' ? 'Remote' : 'Floor'}
                tone={head.mode === 'remote' ? 'remote' : 'floor'}
              />
              {/* § 12: the status tag is the way into pause-or-end. Wrapped
                  rather than made pressable, because a Tag states a fact and
                  giving every tag in the app an onPress would invite taps on
                  the ones that go nowhere. */}
              <Pressable
                onPress={() => navigation.navigate('ClientEnd', { clientId })}
                accessibilityRole="button"
                accessibilityLabel={`${head.statusLabel}. Pause or end`}
              >
                <Tag
                  label={head.statusLabel}
                  tone={head.status === 'active' ? 'ok' : head.status === 'paused' ? 'warn' : 'neutral'}
                />
              </Pressable>
            </>
          }
          actions={
            <>
              {/* One primary verb — and for a client who owes you money it is
                  not "Book". The pair belongs to the overview; every other tab
                  carries its own primary at the bottom instead. */}
              {head.owedLabel ? (
                <>
                  <Button
                    label={head.owedLabel}
                    icon={IconRupee}
                    onPress={() => navigation.navigate('MoneyBook', { clientId, record: true })}
                    style={styles.act}
                  />
                  <Button
                    label="Book"
                    variant="ghost"
                    onPress={() =>
                      navigation.navigate('Home', {
                        screen: 'DiaryTab',
                        params: { book: true, clientId },
                      } as never)
                    }
                    style={styles.act}
                  />
                </>
              ) : (
                <>
                  {/* Nothing owed, so the design's own rule inverts: the one
                      primary verb IS "Book". "Record a payment" also does not
                      fit a half-width button, and a truncated verb is worse
                      than a demoted one. */}
                  <Button
                    label="Book"
                    icon={IconCalendar}
                    onPress={() =>
                      navigation.navigate('Home', {
                        screen: 'DiaryTab',
                        params: { book: true, clientId },
                      } as never)
                    }
                    style={styles.act}
                  />
                  <Button
                    label="Payment"
                    variant="ghost"
                    icon={IconRupee}
                    onPress={() => navigation.navigate('MoneyBook', { clientId, record: true })}
                    style={styles.act}
                  />
                </>
              )}
            </>
          }
        />

        <Tabs
          items={FILE_TABS}
          value={tab}
          onChange={(key) => setTab(key as FileTab)}
          style={styles.tabs}
        />

        {tab === 'overview' && overview ? (
          <>
            <Figures
              collected={overview.owed}
              owed={overview.sessionsLeft}
              owedSuffix={overview.sessionsSuffix}
              labels={['Owes you', 'Sessions left']}
              tones={[overview.owedRaw > 0 ? 'warn' : 'plain', 'plain']}
              bar={false}
              collectedPart={0}
              owedPart={0}
              onCollected={() => navigation.navigate('MoneyBook', { clientId })}
              onOwed={() => setTab('package')}
            />

            <Kv style={styles.kv}>
              {overview.rows.map((row) => (
                <KvRow
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  suffix={row.suffix}
                  detail={row.detail}
                  leading={
                    row.key === 'adherence' ? (
                      <Streak days={overview.week.map((on) => (on ? 'done' : 'unknown'))} />
                    ) : undefined
                  }
                  onPress={row.link ? () => follow(row.link, row.targetId) : undefined}
                />
              ))}
            </Kv>

            <Callout style={styles.note}>
              <CalloutStrong>
                Every figure on this screen is computed from what&apos;s on this phone.
              </CalloutStrong>{' '}
              The file opens with no network call — and the adherence strip recounts the moment you
              mark a session.
            </Callout>
          </>
        ) : null}

        {tab === 'programs' ? (
          <>
            {programs.current ? (
              <Card style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardMain}>
                    <Text style={styles.h3}>{programs.current.name}</Text>
                    <Text style={styles.sub}>{programs.current.assigned}</Text>
                  </View>
                  <Tag label="On now" tone="accent" />
                </View>
                {programs.current.week ? (
                  <View style={styles.weekRow}>
                    <Bar
                      segments={[{ key: 'w', fraction: programs.current.week.part, color: colors.accent }]}
                      style={styles.weekBar}
                    />
                    {/* The words as well as the bar: "week 6 of 8" is what a
                        trainer says out loud, and 69% is not. */}
                    <Text style={styles.weekLabel}>
                      {programs.current.week.label} <Text style={styles.weekOf}>{programs.current.week.of}</Text>
                    </Text>
                  </View>
                ) : null}
                {programs.current.thisWeek ? (
                  <List style={styles.inner}>
                    <Row
                      grouped
                      title={programs.current.thisWeek}
                      subtitle={programs.current.logged ?? undefined}
                    />
                  </List>
                ) : null}
              </Card>
            ) : (
              <Empty
                icon={IconLayers}
                title="No program yet"
                body={`${first} can train without one — sessions log fine and the pack still counts down. Assign one when the plan is settled.`}
                style={styles.empty}
              />
            )}

            <Callout style={styles.note}>
              This is <CalloutStrong>{first}&apos;s copy</CalloutStrong> of the program. Editing the
              template it came from won&apos;t touch a plan they are halfway through.
            </Callout>

            {programs.history.length ? (
              <>
                <SectionHead label="What they've been on" count={programs.history.length} />
                <Timeline style={styles.timeline}>
                  {programs.history.map((row, i) => (
                    <TimelineItem
                      key={row.id}
                      index={row.mark && row.mark !== '—' ? Number(row.mark) : 0}
                      mark={row.mark === '—' ? '—' : undefined}
                      label={row.name}
                      meta={row.detail}
                      state={row.current ? 'now' : 'done'}
                      last={i === programs.history.length - 1}
                    />
                  ))}
                </Timeline>
              </>
            ) : null}

            <Button
              label="Change program"
              variant="secondary"
              block
              icon={IconLayers}
              onPress={() => navigation.navigate('ProgramList', { clientId })}
              style={styles.primary}
            />
          </>
        ) : null}

        {tab === 'sessions' ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {sessions.counts.map((c) => (
                <Chip
                  key={c.key}
                  label={c.label}
                  count={c.count}
                  selected={filter === c.key}
                  onPress={() => setFilter(c.key)}
                />
              ))}
            </ScrollView>

            {sessions.groups.length ? (
              sessions.groups.map((group) => (
                <View key={group.title}>
                  <SectionHead label={group.title} count={group.count} />
                  <List style={styles.group}>
                    {group.rows.map((row) => (
                      <Row
                        key={row.id}
                        grouped
                        leading={<RowTime time={row.time} meridiem={row.day} />}
                        severity={row.spine ? 'critical' : undefined}
                        title={row.title}
                        subtitle={row.detail}
                        trailing={<Tag label={row.tag} tone={row.tone} />}
                        onPress={() => navigation.navigate('SessionDetail', { sessionId: row.id })}
                      />
                    ))}
                  </List>
                </View>
              ))
            ) : (
              <Empty
                icon={IconChart}
                title="Nothing here yet"
                body="Booked, done, no-show and cancelled sessions all land on this list."
                style={styles.empty}
              />
            )}

            <Callout style={styles.note}>
              <CalloutStrong>Done and no-show both take one off the pack. Cancelled doesn&apos;t.</CalloutStrong>{' '}
              Whichever you picked is undoable for 24 hours, from here and from the pack.
            </Callout>
          </>
        ) : null}

        {tab === 'package' ? (
          pack ? (
            <>
              <Card style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardMain}>
                    <Text style={styles.h3}>{pack.title}</Text>
                    <Text style={styles.sub}>{pack.bought}</Text>
                  </View>
                  <Tag label={pack.status} tone={pack.status === 'Current' ? 'accent' : 'neutral'} />
                </View>

                <View style={styles.packRow}>
                  <View>
                    <Text style={styles.packLabel}>Sessions left</Text>
                    <Text style={styles.packValue}>
                      {pack.left}
                      <Text style={styles.packOf}>{pack.leftSuffix}</Text>
                    </Text>
                  </View>
                  <View style={styles.packRight}>
                    <Text style={[styles.packLabel, styles.right]}>Expires</Text>
                    <Text style={[styles.packValue, styles.right, styles.packSmall]}>{pack.expires}</Text>
                  </View>
                </View>

                <Bar
                  segments={[
                    { key: 'left', fraction: pack.part, color: colors.accent },
                    { key: 'used', fraction: 1 - pack.part, color: colors.surface3 },
                  ]}
                  style={styles.packBar}
                />
                <Legend
                  entries={[
                    { key: 'left', label: pack.legend.left, color: colors.accent },
                    { key: 'used', label: pack.legend.used, color: colors.surface3 },
                  ]}
                />
              </Card>

              <Kv style={styles.kv}>
                <KvRow
                  label="Still owed"
                  value={pack.owed}
                  detail={pack.owedDetail}
                  tone={pack.owedRaw > 0 ? colors.warn : undefined}
                  onPress={() => navigation.navigate('MoneyBook', { clientId })}
                />
                {pack.cut ? (
                  <KvRow label="Gym's cut" value={pack.cut} detail={pack.cutDetail ?? undefined} />
                ) : null}
              </Kv>

              {pack.renewLabel ? (
                <Button
                  label={pack.renewLabel}
                  size="lg"
                  block
                  icon={IconRupee}
                  onPress={() => navigation.navigate('MoneyPacks')}
                  style={styles.primary}
                />
              ) : null}
              <Button
                label="Move them to a different pack"
                variant="text"
                block
                onPress={() => navigation.navigate('MoneyPacks')}
              />

              {pack.perSession ? (
                <Callout style={styles.note}>
                  Renewing keeps them at <CalloutStrong>₹{pack.perSession} a session</CalloutStrong>.
                  A smaller pack works out dearer per session — say it before they ask.
                </Callout>
              ) : null}
            </>
          ) : (
            <Empty
              icon={IconRupee}
              title="No pack yet"
              body={`${first} can train without one. Sell a pack on the day they pay, and this tab starts counting it down.`}
              style={styles.empty}
            />
          )
        ) : null}
      </Animated.ScrollView>

      <FileMenu
        visible={menu}
        clientId={clientId}
        phone={head.phone}
        paused={head.status === 'paused'}
        onClose={() => setMenu(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  act: { flex: 1 },
  tabs: { marginBottom: space.s4 },

  kv: { marginTop: space.s3 },
  note: { marginTop: space.s3 },
  primary: { marginTop: space.s4 },
  group: { marginBottom: space.s2 },
  empty: { marginTop: space.s6 },
  timeline: { marginBottom: space.s2 },
  chips: { gap: space.s2, paddingBottom: space.s3 },

  card: { marginBottom: space.s3 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  cardMain: { flex: 1, minWidth: 0 },
  h3: { fontSize: 17, fontWeight: '700', letterSpacing: -0.26, color: colors.ink },
  sub: { fontSize: 13.5, lineHeight: 20, color: colors.ink3, marginTop: 3 },
  inner: { marginTop: space.s3 },

  weekRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s4 },
  weekBar: { flex: 1 },
  weekLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, ...tnum },
  weekOf: { fontWeight: '500', color: colors.ink3 },

  packRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.s4,
    marginTop: space.s4,
  },
  packRight: { alignItems: 'flex-end' },
  right: { textAlign: 'right' },
  packLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink3,
    marginBottom: 7,
  },
  packValue: { fontSize: 29, fontWeight: '800', letterSpacing: -1.02, color: colors.ink, ...tnum },
  packSmall: { fontSize: 19, letterSpacing: -0.5 },
  packOf: { fontSize: 15, fontWeight: '700', color: colors.ink3, letterSpacing: 0 },
  packBar: { marginTop: space.s4 },

  gone: { marginTop: space.s7 },
  loading: { marginTop: space.s4 },
  loadingGap: { marginTop: space.s4 },
});
