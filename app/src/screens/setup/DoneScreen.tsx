/**
 * Screen 02 · Trainer setup · After setup.
 *
 * `agent/design system/screens/trainxtrainersetup.html` § 06 · 6a.
 *
 * No confetti. Finishing a form is not an achievement — the celebration is
 * saved for the first booking and the first payout, where the trainer has
 * actually earned something. Spending it here devalues both.
 *
 * The rest of the profile is not nagged for either. Whatever was skipped is
 * picked up by the completion meter on the deck (`Meter`), which opens at the
 * work already done rather than at zero.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../store/AuthContext';
import { useSetup } from '../../setup/SetupContext';
import { Button, DoneMark, IconPlus, colors } from '../../design';
import { AuthTop } from '../auth/authLayout';
import { SetupFoot, SetupScreen } from './setupLayout';

export default function DoneScreen() {
  const { draft } = useSetup();
  const { completeSetup } = useAuth();

  // First name only. "You're set up, Ravi Kannan" reads like a form letter.
  const firstName = draft.name.trim().split(/\s+/)[0] ?? '';

  return (
    <SetupScreen>
      <AuthTop />

      <View style={styles.done}>
        <DoneMark />
        <Text style={styles.title}>{firstName ? `You're set up, ${firstName}` : "You're set up"}</Text>
        <Text style={styles.body}>
          Everything else can wait. Add your first client and Train X starts tracking from day one.
        </Text>
      </View>

      <SetupFoot>
        <Button
          label="Add my first client"
          variant="primary"
          size="lg"
          block
          icon={IconPlus}
          onPress={() => void completeSetup('addClient')}
        />
        <Button
          label="Take a look around first"
          variant="ghost"
          size="lg"
          block
          style={styles.second}
          onPress={() => void completeSetup('home')}
        />
      </SetupFoot>
    </SetupScreen>
  );
}

const styles = StyleSheet.create({
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  title: { fontSize: 25, fontWeight: '800', letterSpacing: -0.75, color: colors.ink, textAlign: 'center' },
  body: {
    fontSize: 14.5,
    lineHeight: 22.5,
    color: colors.ink2,
    textAlign: 'center',
    maxWidth: 280,
  },
  second: { marginTop: 10 },
});
