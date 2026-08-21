/**
 * 6i · the team's shared shelf.
 *
 * ── Why this is the row a coach joins a team for ──────────────────────────
 *
 * Client visibility is an admin's feature. The library is the one team-wide
 * thing a plain coach gets, and it is most of the day-one value of joining:
 * somebody else has already built the eight-week plan you were about to write on
 * a phone.
 *
 * ── Copy, not share ──────────────────────────────────────────────────────
 *
 * Tapping a teammate's program copies it into your own shelf and stops there.
 * Programs are already copies by design in this product — assigning one to a
 * client copies it again, so a template edit never reaches a plan somebody is
 * halfway through — and this is the same rule one level up. Sharing in place
 * would mean a coach's plan changing under them because a colleague tidied their
 * own shelf.
 *
 * The copy is a REST write, so it needs a connection like everything else
 * team-wide. But the *result* lands in local `templates` through ordinary sync,
 * which is why this screen syncs after copying and then sends the trainer to
 * their own program screen: from that moment it is theirs, offline, editable,
 * and no longer anything to do with the team.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import {
  copyTeamTemplate,
  fetchTeamTemplates,
  TeamError,
  type TeamTemplateRow,
} from '../../../api/team';
import { syncDatabase } from '../../../db/sync';
import {
  AppBar,
  Avatar,
  Banner,
  Callout,
  Empty,
  GroupHead,
  IconBack,
  IconButton,
  IconCloudOff,
  IconCopy,
  IconLayers,
  List,
  Row,
  SkeletonRow,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function TeamLibraryScreen() {
  const navigation = useNavigation<Nav>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const [rows, setRows] = useState<TeamTemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchTeamTemplates());
      setError(null);
    } catch (e) {
      setError(e instanceof TeamError ? e.message : 'Could not load the team’s programs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Split rather than sorted, because the two halves answer different
   * questions. "What have I got" is a shelf; "what has the team got" is a
   * catalogue, and a single alphabetical list makes the reader work out which is
   * which from a badge.
   */
  const { mine, theirs } = useMemo(() => {
    const all = rows ?? [];
    return {
      mine: all.filter((row) => row.mine),
      theirs: all.filter((row) => !row.mine),
    };
  }, [rows]);

  const copy = async (template: TeamTemplateRow) => {
    setCopying(template.id);
    setNotice(null);
    try {
      const result = await copyTeamTemplate(template.id);
      // It is a local template from here on, so pull it down before leaving —
      // the program screen reads from SQLite, not from this response.
      await syncDatabase('team');
      setNotice(`Copied as “${result.name}”. It’s yours to edit now.`);
      void load();
    } catch (e) {
      setNotice(e instanceof TeamError ? e.message : 'Could not copy that program.');
    } finally {
      setCopying(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="Team programs"
          subtitle={rows ? `${rows.length} on the shelf` : undefined}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading && rows !== null} onRefresh={load} tintColor={colors.accent} />
        }
      >
        {offline ? (
          <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
            The team’s shelf lives online. Your own programs are under Programs and work offline.
          </Banner>
        ) : null}

        {error && rows === null ? (
          <Banner tone="error" style={styles.banner}>
            {error}
          </Banner>
        ) : null}

        {rows === null && !offline && error === null ? (
          <View style={styles.skeleton}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : null}

        {rows !== null && rows.length === 0 ? (
          <Empty
            icon={IconLayers}
            title="Nothing on the shelf yet"
            body="Every program any coach in the team builds shows up here, ready to copy."
            style={styles.empty}
          />
        ) : null}

        {theirs.length > 0 ? (
          <View style={styles.group}>
            <GroupHead label="From your team" count={theirs.length} />
            <List>
              {theirs.map((template) => (
                <Row
                  key={template.id}
                  grouped
                  wrap
                  leading={<Avatar name={template.coachName ?? ''} size="sm" />}
                  title={template.name}
                  subtitle={shape(template)}
                  // The whole row is the copy target rather than a button on the
                  // end of it. Two ways to fire the same write is two things to
                  // aim at on a phone, and the tag says which one it is.
                  trailing={
                    <Tag
                      label={copying === template.id ? 'Copying…' : 'Copy'}
                      tone={copying === template.id ? 'accent' : 'neutral'}
                    />
                  }
                  onPress={offline || copying !== null ? undefined : () => void copy(template)}
                />
              ))}
            </List>
          </View>
        ) : null}

        {mine.length > 0 ? (
          <View style={styles.group}>
            <GroupHead label="Yours" count={mine.length} />
            <List>
              {mine.map((template) => (
                <Row
                  key={template.id}
                  grouped
                  wrap
                  leading={<Avatar name={template.name} size="sm" square />}
                  title={template.name}
                  subtitle={shape(template)}
                  trailing={<Tag label="Yours" tone="accent" />}
                  // Straight into the real editor: this one is already local.
                  onPress={() => navigation.navigate('Program', { templateId: template.id })}
                />
              ))}
            </List>
          </View>
        ) : null}

        {rows !== null && rows.length > 0 ? (
          <Callout icon={IconCopy} style={styles.note}>
            Copying makes it yours. Editing your copy never touches the original, and a teammate
            editing theirs never touches yours.
          </Callout>
        ) : null}
      </ScrollView>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/** "Ravi · 3 days · 14 exercises · 2 clients on it" — shape, not just a name. */
function shape(template: TeamTemplateRow): string {
  const parts: string[] = [];
  if (!template.mine && template.coachName) parts.push(template.coachName.split(' ')[0]);
  parts.push(`${template.days} day${template.days === 1 ? '' : 's'}`);
  parts.push(`${template.exercises} exercise${template.exercises === 1 ? '' : 's'}`);
  if (template.clientsOnIt > 0) {
    parts.push(`${template.clientsOnIt} on it`);
  }
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s4 },
  skeleton: { gap: space.s2, marginTop: space.s4 },
  empty: { marginTop: space.s7 },
  group: { marginBottom: space.s5 },
  note: { marginTop: space.s2 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
