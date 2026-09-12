/**
 * What a client sees.
 *
 * The one button that matters on a profile screen. A trainer cannot reason about
 * privacy from a list of settings — they can look at it, and then they know.
 *
 * So this is built from the *allowed* fields only, and deliberately not by
 * hiding things from a copy of the profile. Rendering everything and hiding the
 * private half would mean the day someone adds a field, it appears here by
 * default. This way a new field is invisible to clients until somebody writes
 * a line to show it, which is the correct direction for that mistake to fall.
 *
 * The footer lists what is withheld by name. "Your phone number is private" is
 * a stronger statement than the absence of a phone number, and the absence is
 * indistinguishable from a bug.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TrainerProfile } from '../../../api/trainer';
import { CERTIFICATIONS, LANGUAGES, SPECIALITIES, labelFor } from '../../../setup/options';
import {
  Avatar,
  Callout,
  CalloutStrong,
  IconLock,
  Seg,
  Sheet,
  Tag,
  colors,
  radius,
  space,
  type,
} from '../../../design';

export interface ClientViewSheetProps {
  visible: boolean;
  profile: TrainerProfile | null;
  onClose: () => void;
}

export default function ClientViewSheet({ visible, profile, onClose }: ClientViewSheetProps) {
  return (
    <Sheet visible={visible && profile !== null} onClose={onClose} title="What a client sees">
      {profile ? (
        <>
          {/* A card rather than a list, because this is a profile being looked
              at from outside — the same object a client would see in their app. */}
          <View style={styles.card}>
            <View style={styles.head}>
              <Avatar name={profile.name} size="xl" />
              <View style={styles.headMain}>
                <Text style={styles.name} numberOfLines={2}>
                  {profile.name}
                </Text>
                <Text style={styles.role}>Personal trainer</Text>
              </View>
            </View>

            {profile.specialities.length ? (
              <>
                <Text style={styles.label}>Works with</Text>
                <Seg style={styles.tags}>
                  {profile.specialities.map((id, i) => (
                    <Tag key={id} label={labelFor(id, SPECIALITIES)} tone={i === 0 ? 'accent' : 'neutral'} />
                  ))}
                </Seg>
              </>
            ) : null}

            {profile.certifications.length ? (
              <>
                <Text style={styles.label}>Certifications</Text>
                {profile.certifications.map((id) => (
                  <Text key={id} style={styles.line}>
                    {labelFor(id, CERTIFICATIONS)}
                  </Text>
                ))}
                {/* Said here as well as on the profile, because this is the copy
                    a client reads and it should not overstate what it means. */}
                <Text style={styles.fine}>Self-declared, not verified by InclineYou.</Text>
              </>
            ) : null}

            {profile.languages.length ? (
              <>
                <Text style={styles.label}>Speaks</Text>
                <Text style={styles.line}>
                  {profile.languages.map((id) => labelFor(id, LANGUAGES)).join(', ')}
                </Text>
              </>
            ) : null}

            {profile.gymName ? (
              <>
                <Text style={styles.label}>Trains at</Text>
                <Text style={styles.line}>{profile.gymName}</Text>
              </>
            ) : null}
          </View>

          <Callout icon={IconLock} style={styles.note}>
            Not shown: your <CalloutStrong>phone number</CalloutStrong>, your{' '}
            <CalloutStrong>UPI ID</CalloutStrong>, the gym&apos;s cut, and what any other client
            pays.
          </Callout>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.r3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.cardPad,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headMain: { flex: 1, minWidth: 0 },
  name: { ...type.h2, color: colors.ink },
  role: { ...type.bodySm, color: colors.ink3, marginTop: 3 },

  label: {
    ...type.micro,
    color: colors.ink3,
    marginTop: space.s4,
    marginBottom: space.s2,
  },
  tags: {},
  line: { ...type.body, color: colors.ink2, marginBottom: 2 },
  fine: { fontSize: 11.5, color: colors.ink3, marginTop: 6 },

  note: { marginTop: space.s4 },
});
