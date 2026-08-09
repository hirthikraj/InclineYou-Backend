/**
 * Screen 02 · Trainer setup · Before anything.
 *
 * `agent/design system/screens/trainxtrainersetup.html` § 01:
 *   1a  what we'll ask   — a first run, nothing answered yet
 *   1b  resume           — come back to a part-finished flow
 *
 * The most-named onboarding complaint across every platform in the teardown was
 * not form length, it was SURPRISE — being asked for things nobody warned you
 * about. A pre-flight screen costs one tap and prevents the worst review you'll
 * get, so it is not skippable chrome.
 *
 * There is deliberately no greeting by name: all sign-in gave us is a phone
 * number. We learn the name on the very next screen.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SetupStackParamList } from '../../navigation/SetupStack';
import { STEP_ROUTES } from '../../navigation/SetupStack';
import { useAuth } from '../../store/AuthContext';
import { useSetup } from '../../setup/SetupContext';
import {
  EXPERIENCE_BANDS,
  LANGUAGES,
  SPECIALITIES,
  CERTIFICATIONS,
  labelFor,
  labelList,
} from '../../setup/options';
import {
  SETUP_STEPS,
  STEP_LABELS,
  hasProgress,
  isAnswered,
  isSettled,
  nextStep,
  secondsLeft,
  type SetupDraft,
  type SetupStep,
} from '../../setup/draft';
import {
  Button,
  Callout,
  CalloutStrong,
  IconBadge,
  IconCloudOff,
  IconMessage,
  IconRupee,
  IconUser,
  Timeline,
  TimelineItem,
  colors,
  radius,
  space,
  type IconProps,
} from '../../design';
import { AuthTop, Brandmark, Legal } from '../auth/authLayout';
import { SetupBody, SetupFoot, SetupScreen, SetupSub, SetupTitle } from './setupLayout';

type Props = {
  navigation: NativeStackNavigationProp<SetupStackParamList, 'Preflight'>;
};

/** What each step will ask for, and — where it matters — that it's optional. */
const PREFLIGHT: { icon: React.ComponentType<IconProps>; title: string; body: string }[] = [
  {
    icon: IconUser,
    title: 'Your name',
    body: 'Clients see this on every invite you send',
  },
  {
    icon: IconBadge,
    title: 'Experience and certifications',
    body: 'Optional — and "not certified yet" is a real answer',
  },
  {
    icon: IconMessage,
    title: 'Languages you coach in',
    body: 'Clients filter by this',
  },
  {
    icon: IconRupee,
    title: 'How you get paid',
    body: 'Your UPI ID. You can do this later.',
  },
];

export default function PreflightScreen({ navigation }: Props) {
  const { draft, ready, finish } = useSetup();
  const { completeSetup } = useAuth();

  // Nothing renders off an unread draft: showing 1a for a beat and then
  // swapping to 1b would tell the trainer their answers were lost.
  if (!ready) return <SetupScreen>{null}</SetupScreen>;

  const resuming = hasProgress(draft);
  const owed = nextStep(draft);

  const start = () => {
    navigation.navigate(owed ? STEP_ROUTES[owed] : 'Done');
  };

  /**
   * "Finish the rest later" IS finishing setup — the remainder moves to the
   * completion meter on the deck. So the partial profile goes to the server
   * here; without this it would sit on the phone forever and the server would
   * keep asking for setup on every fresh sign-in.
   */
  const later = async () => {
    await finish();
    await completeSetup('home');
  };

  return (
    <SetupScreen>
      <AuthTop>
        <Brandmark />
      </AuthTop>

      {/* Scrollable: six timeline items plus a headline out-runs a 360×640
          screen, and a resume screen that hides the last two steps is worse
          than useless. */}
      <SetupBody>{resuming ? <ResumeBody draft={draft} /> : <FirstRunBody />}</SetupBody>

      <SetupFoot>
        <Button
          // Nothing left to ask means everything was answered or skipped, and
          // "Continue setup" would be pointing at a screen that just says done.
          label={!resuming ? 'Start' : owed ? 'Continue setup' : 'Finish setup'}
          variant="primary"
          size="lg"
          block
          onPress={start}
        />
        {resuming ? (
          <Button
            label="Finish the rest later"
            variant="ghost"
            size="lg"
            block
            style={styles.secondAction}
            onPress={() => void later()}
          />
        ) : (
          <Legal>You can change any of this later in Settings.</Legal>
        )}
      </SetupFoot>
    </SetupScreen>
  );
}

/* ------------------------------------------------------------------ 1a */

function FirstRunBody() {
  return (
    <>
      <SetupTitle>Let's set up your account</SetupTitle>
      <SetupSub>Six quick questions. Mostly taps — you'll type twice. About a minute.</SetupSub>

      <View style={styles.list}>
        {PREFLIGHT.map(({ icon: Icon, title, body }, i) => (
          <View key={title} style={[styles.row, i < PREFLIGHT.length - 1 && styles.rowDivider]}>
            <View style={styles.rowIcon}>
              <Icon size={17} color={colors.ink3} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{title}</Text>
              <Text style={styles.rowBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* The offline promise is named before anything is asked for, not after. */}
      <Callout tone="accent" icon={IconCloudOff} style={styles.trailing}>
        <CalloutStrong tone="accent">Nothing here needs internet.</CalloutStrong> It all saves on
        your phone and syncs when you're back on.
      </Callout>
    </>
  );
}

/* ------------------------------------------------------------------ 1b */

function ResumeBody({ draft }: { draft: SetupDraft }) {
  const upNext = nextStep(draft);
  const done = SETUP_STEPS.filter((step) => isSettled(step, draft)).length;

  return (
    <>
      <SetupTitle>Nearly there</SetupTitle>
      <SetupSub>
        {done === 1 ? 'One step' : `${done} steps`} done, nothing lost.{' '}
        <Text style={styles.subStrong}>About {secondsLeft(draft)} seconds left.</Text>
      </SetupSub>

      {/* No step bar on this screen: the timeline IS the progress indicator, and
          two progress systems on one screen contradict each other. */}
      <Timeline>
        {SETUP_STEPS.map((step, i) => (
          <TimelineItem
            key={step}
            index={i + 1}
            label={STEP_LABELS[step]}
            meta={stepMeta(step, draft, step === upNext)}
            state={isSettled(step, draft) ? 'done' : step === upNext ? 'now' : 'todo'}
            last={i === SETUP_STEPS.length - 1}
          />
        ))}
      </Timeline>
    </>
  );
}

/**
 * A finished step shows the answer it was given — that is the whole point of
 * the timeline over a row of ticks. The step that's next says what it costs.
 */
function stepMeta(step: SetupStep, draft: SetupDraft, isNext: boolean): string | undefined {
  if (isNext) {
    const optional = step === 'certifications' || step === 'payment';
    return optional ? 'Up next · optional' : 'Up next';
  }
  if (!isSettled(step, draft)) return undefined;
  if (!isAnswered(step, draft)) return 'Skipped';

  switch (step) {
    case 'name':
      return draft.name;
    case 'experience':
      return draft.experience ? labelFor(draft.experience, EXPERIENCE_BANDS) : undefined;
    case 'specialities':
      return labelList(draft.specialities, SPECIALITIES);
    case 'certifications':
      return labelList(draft.certifications, CERTIFICATIONS, 2);
    case 'languages':
      return labelList(draft.languages, LANGUAGES);
    case 'payment':
      return draft.upiId;
  }
}

const styles = StyleSheet.create({
  subStrong: { color: colors.ink },

  list: { marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.r2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
  rowBody: { fontSize: 12.5, lineHeight: 18, color: colors.ink3, marginTop: 3 },

  trailing: { marginTop: 'auto' },
  secondAction: { marginTop: 10 },
});
