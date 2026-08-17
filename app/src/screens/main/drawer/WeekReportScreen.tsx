/**
 * 7a · One weekly report, and 7b · sending it again.
 *
 * Laid out as the client's own copy is laid out, deliberately. A trainer
 * standing next to somebody who is asking about their week should be looking at
 * the same screen they are, in the same order — kept first, then the totals,
 * then the best lift. Re-arranging it for the trainer would mean two people
 * holding two phones trying to find each other's numbers.
 *
 * ── The message is shown before it is sent ────────────────────────────────
 *
 * The same rule the money export keeps: nothing leaves the phone before the
 * trainer has read it. What is drawn in the preview block is the exact string
 * that goes into WhatsApp — not a description of it — because a preview that is
 * merely representative is how a wrong name reaches a client.
 *
 * ── XRep never sends ──────────────────────────────────────────────────────
 *
 * `whatsappUri` opens the conversation with the text in it and the trainer taps
 * send, which is the same refusal every nudge rule makes. The report went out
 * automatically on Sunday; this is a person choosing to send it again, and that
 * choice stays a person's.
 *
 * A client with no number gets the OS share sheet and no WhatsApp button — the
 * button would open nothing, and a control that does nothing is worse than an
 * absent one.
 */

import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useWeekly } from '../../../reports/useWeekly';
import {
  buildWeeklyReport,
  DELIVERY,
  latestReportFor,
  reportMessage,
} from '../../../reports/weekly';
import { whatsappUri } from '../../../nudges/rules';
import {
  AppBar,
  Button,
  Callout,
  CalloutStrong,
  Card,
  Empty,
  IconBack,
  IconButton,
  IconChart,
  IconMessage,
  IconShare,
  IconStar,
  IconUser,
  Legend,
  List,
  Reveal,
  Row,
  SectionHead,
  Skeleton,
  Stat,
  StatRail,
  Tag,
  Toast,
  WeekBars,
  colors,
  radius,
  space,
  tnum,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'WeekReport'>;

export default function WeekReportScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { input, ready } = useWeekly();
  const [notice, setNotice] = useState<string | null>(null);

  const { reportId, clientId } = route.params;

  const view = useMemo(() => {
    const id = reportId ?? (clientId ? latestReportFor(input, clientId) : null);
    return id ? buildWeeklyReport(input, id) : null;
  }, [input, reportId, clientId]);

  const message = useMemo(() => (view ? reportMessage(view) : ''), [view]);
  const uri = view ? whatsappUri(view.phone, message) : null;

  const openWhatsApp = async () => {
    if (!uri) return;
    const opened = await Linking.canOpenURL(uri);
    if (!opened) {
      setNotice('WhatsApp is not installed on this phone. Share it another way.');
      return;
    }
    await Linking.openURL(uri);
  };

  const shareAnywhere = async () => {
    if (!view) return;
    await Share.share({ message, title: `${view.name} · ${view.range}` });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view?.name ?? 'Weekly report'}
          subtitle={view?.range}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            view ? (
              <IconButton
                icon={IconUser}
                label="Open client"
                bare
                onPress={() => navigation.navigate('ClientDetail', { clientId: view.clientId })}
              />
            ) : undefined
          }
        />
      </View>

      <Reveal ready={ready} skeleton={<ReportSkeleton />} style={styles.reveal}>
        {!view ? (
          /* Two ways to land here with nothing, and they are not the same
             thing. A client who has not had a first Sunday yet is normal; a
             report id that no longer resolves is not. */
          <Empty
            icon={IconChart}
            title={clientId ? 'No report yet' : 'That report is gone'}
            body={
              clientId
                ? 'XRep writes one on Sunday night from the sessions you logged that week. The first one lands after their first full week with you.'
                : 'It was on this phone and is not any more — most likely the client was removed. Nothing else was affected.'
            }
            style={styles.empty}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* 7c, on the screen the state belongs to. Warm only when there is
                something to fix — a sent report needs no banner. */}
            {view.state !== 'sent' ? (
              <Callout
                icon={IconChart}
                tone={view.state === 'unreachable' ? 'accent' : 'neutral'}
                style={styles.state}
              >
                {view.stateLine}
              </Callout>
            ) : null}

            <Card>
              <View style={styles.head}>
                <View>
                  <Text style={styles.label}>Sessions kept</Text>
                  <Text style={styles.kept}>
                    {view.kept} of {view.planned}
                  </Text>
                </View>
                <View style={styles.headTags}>
                  <Tag label={`${view.percent}%`} tone={view.percent >= 100 ? 'ok' : 'neutral'} />
                  <Tag label={DELIVERY[view.state].label} tone={DELIVERY[view.state].tone} />
                </View>
              </View>

              <WeekBars
                days={view.days.map((day) => ({
                  label: day.label,
                  value: day.trained ? 100 : 14,
                  on: day.trained,
                }))}
                style={styles.bars}
              />
              <Legend
                entries={[
                  { key: 'trained', label: view.trainedLabel, color: colors.accent },
                  { key: 'rest', label: view.restLabel, color: colors.surface3 },
                ]}
              />
            </Card>

            <StatRail style={styles.rail}>
              {/* The unit rides in the label, as it does on the client's copy —
                  a five-figure total with a trailing "kg" truncates first. */}
              <Stat label="Lifted · kg" value={view.volume} />
              <Stat label="Sets" value={view.sets} />
              <Stat label="New bests" value={view.newBests} />
            </StatRail>

            {view.best ? (
              <>
                <SectionHead label="New best this week" />
                <List style={styles.group}>
                  <Row
                    grouped
                    leading={<IconStar size={17} color={colors.pr} filled />}
                    title={view.best.line}
                    subtitle={view.best.previous ?? undefined}
                    trailing={<Tag label="PR" tone="pr" />}
                  />
                </List>
              </>
            ) : null}

            <SectionHead label="Send it again" />
            <Card style={styles.preview}>
              <Text style={styles.previewText}>{message}</Text>
            </Card>

            <View style={styles.actions}>
              {uri ? (
                <Button
                  label="Send on WhatsApp"
                  variant="primary"
                  size="lg"
                  block
                  icon={IconMessage}
                  onPress={() => void openWhatsApp()}
                />
              ) : null}
              <Button
                label={uri ? 'Share another way' : 'Share it'}
                variant={uri ? 'ghost' : 'primary'}
                size="lg"
                block
                icon={IconShare}
                onPress={() => void shareAnywhere()}
              />
            </View>

            <Callout tone="accent" style={styles.note}>
              {view.perfect ? (
                <>
                  <CalloutStrong tone="accent">Nothing here is a miss.</CalloutStrong>{' '}
                  {view.restLabel} is what the plan asks for.{' '}
                </>
              ) : null}
              These are the figures your client already has — the report is stored as it was sent
              and does not move afterwards.
            </Callout>
          </ScrollView>
        )}
      </Reveal>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

function ReportSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Reading the report">
      <Skeleton height={196} round={radius.r3} />
      <Skeleton height={68} round={radius.r2} style={styles.rail} />
      <Skeleton height={110} round={radius.r3} style={styles.group} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  state: { marginBottom: space.s3 },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headTags: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.37,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  kept: { fontSize: 30, fontWeight: '800', letterSpacing: -1.05, color: colors.ink, marginTop: 8, ...tnum },
  bars: { marginTop: space.s4 },

  rail: { marginTop: space.s2 },
  group: { marginBottom: space.s2 },

  preview: { marginBottom: space.s3 },
  // The message as it will arrive, so line breaks are the ones WhatsApp shows.
  previewText: { fontSize: 14, lineHeight: 22, color: colors.ink2 },

  actions: { gap: space.s2 },
  note: { marginTop: space.s4 },
  empty: { marginTop: space.s7 },
  toast: { position: 'absolute', left: space.inset, right: space.inset, bottom: space.s6 },
});
