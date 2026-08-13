/**
 * Trainer-setup screen composition.
 *
 * The design file builds setup on the same `.auth` shell as sign-in — same
 * inset, same 48px top bar, same foot dock — with one addition, `.setup__bar`:
 * back, the step progress, `n / 6`, and Skip when the step is optional. So the
 * shell comes straight from `../auth/authLayout` rather than being restated,
 * and only the differences live here.
 *
 * `agent/design system/screens/xreptrainersetup.html` — `.setup__bar`,
 * `.auth__body`, `.auth__foot`.
 */

import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SkipButton, Steps, StepsLabel, space } from '../../design';
import { SETUP_STEPS, type SetupStep } from '../../setup/draft';
import { AuthScreen, BackButton } from '../auth/authLayout';

export { AuthFoot as SetupFoot, AuthSub as SetupSub, AuthTitle as SetupTitle } from '../auth/authLayout';

/** The shell. Identical to sign-in's, deliberately. */
export function SetupScreen({ children }: { children: React.ReactNode }) {
  return <AuthScreen>{children}</AuthScreen>;
}

export interface SetupBarProps {
  step: SetupStep;
  onBack: () => void;
  /**
   * Present only on the two optional steps. Skip lives up here and nowhere
   * else — beside the primary CTA is where thumb momentum lives, and skips
   * collected there are indistinguishable from intent.
   */
  onSkip?: () => void;
}

export function SetupBar({ step, onBack, onSkip }: SetupBarProps) {
  const index = SETUP_STEPS.indexOf(step);
  const count = SETUP_STEPS.length;

  return (
    <View style={styles.bar}>
      <BackButton onPress={onBack} />
      <Steps count={count} current={index} />
      <StepsLabel current={index} count={count} />
      {onSkip ? <SkipButton onPress={onSkip} /> : null}
    </View>
  );
}

/**
 * `.auth__body` with `overflow-y:auto`. Several steps out-run a 390×844 screen
 * once the keyboard is up, and in onboarding a chip you cannot see is a chip
 * you did not pick — so the body scrolls rather than the options shrinking.
 *
 * `flexGrow:1` on the content is what keeps `marginTop:'auto'` working for the
 * trailing callout when the content is shorter than the screen.
 */
export function SetupBody({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={[styles.bodyContent, style]}
      showsVerticalScrollIndicator={false}
      // Without this a tap on a chip while the keyboard is up is eaten by the
      // dismiss, and the trainer has to tap twice.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    minHeight: 48,
  },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1, paddingTop: 26 },
});
