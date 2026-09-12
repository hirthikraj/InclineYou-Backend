/**
 * 4d · Nudges.
 *
 * Five rules as **if / then**, each with a switch and a live count of who is
 * waiting. Everfit and Trainerize both automate messages on triggers; this takes
 * the triggers and refuses the default.
 *
 * **Every rule defaults to "Ask me first."** InclineYou drafts the message and queues
 * it, and nothing leaves the trainer's WhatsApp until they tap send — because one
 * badly timed automated nudge costs a client, and no automation is worth that.
 *
 * The Waiting tab is derived, not stored. A draft is what a rule says about the
 * data right now, so a client who trained this morning drops off it without
 * anything having to clean up after them. A queue table would eventually hold a
 * reminder to chase money that arrived on Tuesday, and sending that is worse than
 * sending nothing.
 *
 * The badge opens this screen on Waiting rather than Rules when it is non-zero —
 * the tap map's rule, and the right one: a number on a drawer item is a job, and
 * the job is on the second tab.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useNudges } from '../../../nudges/useNudges';
import {
  buildNudges,
  COOLDOWN_DAYS,
  SEND_FROM_HOUR,
  SEND_TO_HOUR,
  whatsappUri,
  type Draft,
  type RuleCard,
} from '../../../nudges/rules';
import { seedRules, setRuleEnabled } from '../../../db/nudges';
import { logReminder } from '../../../db/money';
import { useAuth } from '../../../store/AuthContext';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconClock,
  IconMessage,
  IconSend,
  IconShield,
  List,
  Reveal,
  Row,
  Rule,
  Segmented,
  Skeleton,
  Tag,
  Toast,
  colors,
  radius,
  space,
} from '../../../design';
import RuleSheet from './RuleSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Rt = RouteProp<MainStackParamList, 'NudgeRules'>;

type Tab = 'rules' | 'waiting' | 'sent';

export default function NudgeRulesScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const focused = useIsFocused();
  const { trainerId } = useAuth();
  const { input, now, ready } = useNudges(focused);

  const [tab, setTab] = useState<Tab>(params?.tab ?? 'rules');
  const [editing, setEditing] = useState<RuleCard | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Writes any of the five rules this trainer is missing.
   *
   * On every open rather than once at setup, because a trainer who signed up
   * before this build shipped has no rules at all and would otherwise see an
   * empty screen with no way to fill it. `seedRules` reads first and only creates
   * what is absent, so calling it repeatedly is free.
   */
  useEffect(() => {
    if (!focused || !trainerId) return;
    void seedRules(trainerId);
  }, [focused, trainerId]);

  const view = useMemo(() => buildNudges(input, now), [input, now]);

  /**
   * Dismissing is local and lasts for this visit only.
   *
   * There is nowhere to store it: the draft is derived, so a persisted dismissal
   * would need its own table and its own expiry rules — and "I don't want to
   * message Arjun today" should not silence the rule next week. Leaving the
   * screen clears it, which is the honest lifetime.
   */
  const waiting = view.waiting.filter((d) => !dismissed.includes(d.key));

  const send = async (draft: Draft) => {
    const uri = whatsappUri(draft.phone, draft.text);
    if (!uri) {
      setNotice(`No usable phone number for ${draft.clientName}.`);
      return;
    }
    try {
      await Linking.openURL(uri);
      // Logged as sent when the chat opens, which is the last thing this app can
      // observe. WhatsApp never tells us whether the trainer pressed send, and
      // claiming delivery we cannot see would make the Sent tab fiction.
      if (trainerId) await logReminder(trainerId, draft.clientId, `nudge_${draft.kind}`);
      setDismissed((list) => [...list, draft.key]);
    } catch {
      setNotice('Could not open WhatsApp.');
    }
  };

  const tabs = [
    { key: 'rules' as const, label: 'Rules' },
    { key: 'waiting' as const, label: waiting.length ? `Waiting ${waiting.length}` : 'Waiting' },
    { key: 'sent' as const, label: 'Sent' },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Nudges"
          subtitle={ready ? view.subtitle : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <Reveal ready={ready} skeleton={<NudgesSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Segmented options={tabs} value={tab} onChange={setTab} style={styles.tabs} />

          {tab === 'rules' ? (
            <>
              <View style={styles.stack}>
                {view.rules.map((rule) => (
                  <Rule
                    key={rule.id}
                    icon={IconMessage}
                    title={rule.title}
                    when={rule.when}
                    then={rule.then}
                    note={rule.note ?? undefined}
                    enabled={rule.enabled}
                    onToggle={(next) => {
                      void setRuleEnabled(rule.id, next).catch(() =>
                        setNotice('Could not change that rule.'),
                      );
                    }}
                    onPress={() => setEditing(rule)}
                  />
                ))}
              </View>

              <Callout icon={IconShield} style={styles.note}>
                Every rule defaults to <CalloutStrong>Ask me first</CalloutStrong>. InclineYou will draft
                the message and queue it, but nothing leaves your WhatsApp until you tap send —
                because a badly timed automated nudge costs a client.
              </Callout>
            </>
          ) : null}

          {tab === 'waiting' ? (
            waiting.length ? (
              <>
                <GroupHead label="Drafted for you" count={waiting.length} />
                <List>
                  {waiting.map((draft) => (
                    <Row
                      key={draft.key}
                      grouped
                      wrap
                      minHeight={78}
                      leading={<Avatar name={draft.clientName} size="sm" />}
                      title={draft.clientName}
                      subtitle={`${draft.reason}\n${draft.text}`}
                      trailing={
                        draft.sendable ? (
                          <IconButton
                            icon={IconSend}
                            label={`Send to ${draft.clientName}`}
                            onPress={() => void send(draft)}
                          />
                        ) : (
                          <Tag label={draft.held ?? 'Held'} tone="warn" />
                        )
                      }
                      onLongPress={() => setDismissed((list) => [...list, draft.key])}
                    />
                  ))}
                </List>
                <Text style={styles.fine}>
                  Long-press to skip one for now. Nothing here is sent until you tap send.
                </Text>
              </>
            ) : (
              <Empty
                icon={IconMessage}
                title="Nothing waiting"
                body="No client has tripped a rule. This list fills itself in — you never have to build it."
                iconColor={colors.ok}
                style={styles.empty}
              />
            )
          ) : null}

          {tab === 'sent' ? (
            view.sent.length ? (
              <>
                <GroupHead label="What went out" count={view.sent.length} />
                <List>
                  {view.sent.map((entry) => (
                    <Row
                      key={entry.id}
                      grouped
                      leading={<Avatar name={entry.clientName} size="sm" />}
                      title={entry.clientName}
                      subtitle={`${entry.what} · ${entry.when}`}
                      onPress={() =>
                        navigation.navigate('ClientDetail', { clientId: entry.clientId })
                      }
                      trailing={<Tag label={entry.channel === 'whatsapp' ? 'WhatsApp' : entry.channel} tone="neutral" />}
                    />
                  ))}
                </List>
                {/* Stated plainly, because "Sent" implies more than we know. */}
                <Text style={styles.fine}>
                  This records that the chat was opened with the message in it. WhatsApp never tells
                  us whether it was sent or read, so InclineYou does not claim to know.
                </Text>
              </>
            ) : (
              <Empty
                icon={IconSend}
                title="Nothing sent yet"
                body="Every message you send from a nudge or a payment reminder is listed here."
                style={styles.empty}
              />
            )
          ) : null}

          <Callout icon={IconClock} style={styles.note}>
            Nudges only go out between <CalloutStrong>{SEND_FROM_HOUR}am and {SEND_TO_HOUR - 12}pm</CalloutStrong>,
            and never twice in {COOLDOWN_DAYS} days to the same person. Both limits are fixed, not
            settings.
          </Callout>
        </ScrollView>
      </Reveal>

      <RuleSheet
        rule={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setNotice('Rule saved.');
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

function NudgesSkeleton() {
  return (
    <View style={styles.body} accessibilityLabel="Loading your nudge rules">
      <Skeleton height={48} round={radius.r2} style={styles.tabs} />
      <View style={styles.stack}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={98} round={radius.r2} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  tabs: { marginTop: space.s3 },
  stack: { marginTop: space.s4, gap: space.cardGap },
  note: { marginTop: space.s4 },
  fine: { fontSize: 11.5, lineHeight: 17, color: colors.ink3, marginTop: space.s3 },
  empty: { marginTop: space.s7 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
