/**
 * 2a · You and your business.
 *
 * The drawer's header tap. Every row edits **one field** — the tap map is
 * explicit that this is never a form of twelve, because a trainer who wants to
 * fix a typo in their gym's name should not be walked past their UPI ID to do it.
 *
 * It ends with the only button that matters on a profile screen: **see what a
 * client sees.** A trainer cannot reason about privacy from a settings list.
 * They can look at it, and then they know. The callout above states the rule the
 * preview demonstrates — clients see the name, the photo, the certifications and
 * the languages, and never the phone number, the UPI ID, or what anyone else
 * pays.
 *
 * Loads from the server, not from local storage. This is the one screen in the
 * app whose data is not a WatermelonDB table: the trainer's own profile lives on
 * `/v1/trainers/me` and there is no local mirror of it. So it has a real loading
 * state and a real offline state, and it says which one it is in rather than
 * showing empty fields that look like missing answers.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { getTrainer, updateTrainer, type TrainerProfile } from '../../../api/trainer';
import { mergeProfileIntoDraft } from '../../../setup/profileSync';
import {
  CERTIFICATIONS,
  EXPERIENCE_BANDS,
  LANGUAGES,
  SPECIALITIES,
  labelFor,
} from '../../../setup/options';
import {
  AppBar,
  Avatar,
  Button,
  Callout,
  CalloutStrong,
  GroupHead,
  IconBack,
  IconBadge,
  IconBuilding,
  IconButton,
  IconClock,
  IconEye,
  IconGlobe,
  IconPercent,
  IconUser,
  IconWallet,
  Seg,
  Setting,
  SettingList,
  Skeleton,
  Tag,
  Toast,
  colors,
  space,
  type,
} from '../../../design';
import FieldSheet, { type FieldSpec } from './FieldSheet';
import ClientViewSheet from './ClientViewSheet';

type Nav = NativeStackNavigationProp<MainStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();

  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [field, setField] = useState<FieldSpec | null>(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (!alive) return;
        setProfile(data);
        setFailed(false);
        // The deck's completion meter reads the local draft, so the draft has to
        // learn what this screen edits — otherwise "Add a certification" never
        // ticks. Fire-and-forget: nothing on this screen waits for it.
        void mergeProfileIntoDraft(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Re-read on focus: the gym and the cut are also editable from Getting paid,
  // and coming back to a stale percentage here would make one of the two screens
  // a liar.
  useFocusEffect(load);

  /**
   * Saves one field.
   *
   * The response is the new profile, so it replaces state wholesale rather than
   * being merged — the server may have normalised what was sent (trimmed a name,
   * cleared a percentage because the gym was cleared), and a local merge would
   * show the trainer what they typed instead of what was kept.
   */
  const save = async (patch: Parameters<typeof updateTrainer>[0], what: string) => {
    setField(null);
    try {
      const { data } = await updateTrainer(patch);
      setProfile(data);
      await mergeProfileIntoDraft(data);
      setNotice(`${what} saved.`);
    } catch {
      setNotice(`Could not save your ${what.toLowerCase()}. It needs a connection.`);
    }
  };

  const experience = useMemo(() => {
    if (!profile?.experienceBand) return undefined;
    return EXPERIENCE_BANDS.find((b) => b.id === profile.experienceBand)?.label;
  }, [profile?.experienceBand]);

  const certs = profile?.certifications ?? [];
  const languages = profile?.languages ?? [];
  const specialities = profile?.specialities ?? [];

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title="You and your business"
          subtitle={profile ? `${profile.name} · trainer` : 'Your profile'}
          leading={
            <IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />
          }
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {profile ? (
          <>
            <View style={styles.identity}>
              <Avatar name={profile.name} size="xl" />
              <View style={styles.identityMain}>
                <Text style={styles.name} numberOfLines={1}>
                  {profile.name}
                </Text>
                <Text style={styles.phone}>{formatPhone(profile.phone)}</Text>
                {specialities.length ? (
                  <Seg style={styles.tags}>
                    {specialities.slice(0, 3).map((id, i) => (
                      <Tag key={id} label={labelFor(id, SPECIALITIES)} tone={i === 0 ? 'accent' : 'neutral'} />
                    ))}
                  </Seg>
                ) : null}
              </View>
            </View>

            <GroupHead label="You" />
            <SettingList>
              <Setting
                icon={IconUser}
                label="Name"
                meta="Shown to clients"
                value={profile.name}
                onPress={() =>
                  setField({
                    kind: 'text',
                    key: 'name',
                    title: 'Your name',
                    meta: 'This is what clients see. Use the name they call you.',
                    value: profile.name,
                  })
                }
              />
              <Setting
                icon={IconBadge}
                label="Certifications"
                meta={certs.length ? `${certs.length} added · self-declared` : 'None yet · a real answer'}
                value={certs.length ? shortList(certs, CERTIFICATIONS) : undefined}
                onPress={() =>
                  setField({
                    kind: 'multi',
                    key: 'certifications',
                    title: 'Certifications',
                    meta: 'Self-declared. India has no licensing requirement for personal trainers, so nothing here is verified — and "not certified yet" is a real answer.',
                    options: CERTIFICATIONS,
                    selected: certs,
                  })
                }
              />
              <Setting
                icon={IconGlobe}
                label="Languages"
                meta={
                  languages.length
                    ? languages.map((id) => labelFor(id, LANGUAGES)).join(', ')
                    : 'Not set'
                }
                onPress={() =>
                  setField({
                    kind: 'multi',
                    key: 'languages',
                    title: 'Languages',
                    meta: 'A client may specifically want a Tamil-speaking coach. No competitor asks this.',
                    options: LANGUAGES,
                    selected: languages,
                  })
                }
              />
              <Setting
                icon={IconClock}
                label="Experience"
                meta={experience ?? 'Not set'}
                onPress={() =>
                  setField({
                    kind: 'single',
                    key: 'experienceBand',
                    title: 'Experience',
                    meta: 'A band rather than a number, so it stays true next year without anyone editing it.',
                    options: EXPERIENCE_BANDS,
                    value: profile.experienceBand,
                  })
                }
              />
            </SettingList>

            <GroupHead label="Where you work" />
            <SettingList>
              <Setting
                icon={IconBuilding}
                label="Gym"
                meta={profile.gymName ?? 'On your own · you keep all of it'}
                onPress={() =>
                  setField({
                    kind: 'text',
                    key: 'gymName',
                    title: 'Where you work',
                    meta: 'Leave it empty if you train on your own. Clearing it also clears the gym’s cut.',
                    value: profile.gymName ?? '',
                    optional: true,
                  })
                }
              />
              {/* The cut only exists if there is a gym to take it. Showing "0%"
                  for an independent trainer claims an arrangement. */}
              {profile.gymName ? (
                <Setting
                  icon={IconPercent}
                  label="Gym takes"
                  meta="Of floor sessions only"
                  value={
                    profile.gymSharePercent != null ? `${Number(profile.gymSharePercent)}%` : 'Not set'
                  }
                  onPress={() => navigation.navigate('GettingPaid')}
                />
              ) : null}
              <Setting
                icon={IconWallet}
                label="UPI ID"
                meta="Where clients pay you"
                value={profile.upiVpa ?? 'Not set'}
                onPress={() => navigation.navigate('GettingPaid')}
              />
            </SettingList>

            <Callout icon={IconEye} style={styles.note}>
              Clients see your <CalloutStrong>name, certifications and languages</CalloutStrong>.
              They never see your phone number, your UPI ID, or what anyone else pays.
            </Callout>

            <Button
              label="See what a client sees"
              variant="ghost"
              block
              icon={IconEye}
              onPress={() => setPreview(true)}
              style={styles.preview}
            />
          </>
        ) : failed ? (
          <Callout style={styles.note}>
            Your profile lives on the server and this phone can&apos;t reach it right now. Everything
            else in the app works offline — this one screen needs a connection.
          </Callout>
        ) : (
          /* Not an `Empty`: nothing is empty, it just hasn't arrived. */
          <View style={styles.loading}>
            <Skeleton height={72} />
            <Skeleton height={228} style={styles.loadingGap} />
            <Skeleton height={172} style={styles.loadingGap} />
          </View>
        )}
      </ScrollView>

      <FieldSheet
        spec={field}
        onSave={save}
        onClose={() => setField(null)}
      />
      <ClientViewSheet
        visible={preview}
        profile={profile}
        onClose={() => setPreview(false)}
      />

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/** "+91 98840 21774" — the shape an Indian number is read in. */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return phone;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

/** "K11, ACE" — the acronyms, because the full names do not fit a value column. */
function shortList(ids: string[], catalogue: typeof CERTIFICATIONS): string {
  return ids
    .map((id) => {
      const label = labelFor(id, catalogue);
      // "K11 — Certified Personal Trainer" → "K11".
      return label.split('—')[0].trim().split(' ')[0];
    })
    .slice(0, 3)
    .join(', ');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  identityMain: { flex: 1, minWidth: 0 },
  name: { ...type.h2, color: colors.ink },
  phone: { ...type.bodySm, color: colors.ink3, marginTop: 4 },
  tags: { marginTop: 9 },

  note: { marginTop: space.s4 },
  strong: { fontWeight: '700', color: colors.ink },
  preview: { marginTop: space.s3 },

  loading: { marginTop: space.s4 },
  loadingGap: { marginTop: space.s4 },

  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
