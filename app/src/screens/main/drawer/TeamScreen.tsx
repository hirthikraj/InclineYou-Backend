/**
 * 6a · the team.
 *
 * Two screens behind one route, and the split is the trainer's own state rather
 * than a tab: almost every trainer on this app has no team and never will, so
 * the no-team state is not an empty list — it is a page that explains what a
 * team is for and offers the one action. The in-team state is a coach list.
 *
 * ── The one thing this screen does differently from every other ───────────
 *
 * It reads locally and writes online. `teams` and `team_members` are synced, so
 * the list draws instantly from SQLite and **keeps working with no signal** — an
 * admin on a gym floor can still see who their coaches are. But every button
 * here is a permission change, and a permission change queued offline is one
 * replayed at an unknown later time, possibly after the grant was revoked. So
 * the buttons need a connection and say so, once, in a banner — rather than
 * failing one at a time with a toast each.
 *
 * That is also why nothing here is optimistic. A promotion that appears to have
 * happened and then silently un-happens is worse than a spinner on one button
 * for half a second. Each action shows its own busy state, then the write lands,
 * then `syncDatabase` pulls the truth down and the list re-derives from it.
 *
 * ── The money line stays on screen ───────────────────────────────────────
 *
 * The callout at the bottom is not decoration. "No role ever sees a teammate's
 * money" is the promise the whole money book rests on, it is the first question
 * a coach asks before joining anything, and a promise that only exists in a PRD
 * is a promise nobody has been told.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNetworkState } from 'expo-network';

import type { MainStackParamList } from '../../../navigation/MainStack';
import { useTeam } from '../../../team/useTeam';
import { buildTeam, memberActions, type TeamMemberCard } from '../../../team/team';
import {
  changeRole,
  createTeam,
  deleteTeam,
  inviteCoach,
  leaveTeam,
  removeMember,
  renameTeam,
  revokeInvite,
  setSeatLimit,
  transferOwnership,
  TeamError,
  type TeamInvitationDto,
} from '../../../api/team';
import { useTeamInvitations } from '../../../team/useTeamInvitations';
import { getTrainer } from '../../../api/trainer';
import { syncDatabase } from '../../../db/sync';
import CoachSheet from './CoachSheet';
import CreateTeamSheet from './CreateTeamSheet';
import RenameSheet from './RenameSheet';
import SeatsSheet from './SeatsSheet';
import {
  AppBar,
  Avatar,
  Banner,
  Button,
  Callout,
  CalloutStrong,
  Dialog,
  DialogStrong,
  Empty,
  IconBack,
  IconButton,
  IconCloudOff,
  IconDots,
  IconEdit,
  IconGrid,
  IconLayers,
  IconLock,
  IconLogout,
  IconRupee,
  IconShield,
  IconTrash,
  IconUserAdd,
  IconUsers,
  List,
  Menu,
  Reveal,
  Row,
  SectionHead,
  Setting,
  SettingList,
  Skeleton,
  SkeletonRow,
  Tag,
  Toast,
  colors,
  space,
} from '../../../design';

type Nav = NativeStackNavigationProp<MainStackParamList>;

/** Which irreversible thing is being confirmed, if any. */
type Confirm =
  | { kind: 'leave' }
  | { kind: 'delete' }
  | { kind: 'remove'; member: TeamMemberCard }
  | { kind: 'owner'; member: TeamMemberCard }
  | null;

export default function TeamScreen() {
  const navigation = useNavigation<Nav>();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  const { input, ready, refresh } = useTeam();
  const view = useMemo(() => buildTeam(input), [input]);

  /**
   * The same cache the drawer badge and the home card read, so answering an
   * invitation here clears it everywhere at once. Asked only while the trainer
   * has no team: one team per trainer, so an invitation is unanswerable while
   * they are in one, and drawing it would be offering a button that 409s.
   */
  const invitations = useTeamInvitations(view.empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<TeamMemberCard | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [seating, setSeating] = useState(false);
  const [gymName, setGymName] = useState<string | null>(null);

  /**
   * Re-asked on every focus as well as on mount: the likeliest way onto this
   * screen is a push saying an invitation arrived, and the likeliest second
   * visit is straight after answering one.
   */
  useFocusEffect(
    useCallback(() => {
      if (view.empty) invitations.refresh();
    }, [view.empty]),
  );

  // Only for the create sheet's suggestion, and only when there is no team.
  useEffect(() => {
    if (!view.empty) return;
    let alive = true;
    getTrainer()
      .then(({ data }) => {
        if (alive) setGymName(data.gymName ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [view.empty]);

  /**
   * Every write goes through here: run it, pull the truth down, say what
   * happened in the trainer's words.
   *
   * The `syncDatabase` is what makes the list update itself — without it the
   * screen would sit on stale local rows until the next foreground or reconnect,
   * and the trainer would reasonably conclude the button did nothing.
   */
  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      await syncDatabase('team');
      refresh();
      setNotice(done);
    } catch (e) {
      setNotice(e instanceof TeamError ? e.message : 'Could not do that.');
    } finally {
      setBusy(null);
    }
  };

  const create = (name: string) => {
    setCreating(false);
    void run('create', () => createTeam(name), 'Team created. Invite your first coach.');
  };

  const rename = (name: string) => {
    setRenaming(false);
    void run('rename', () => renameTeam(name), 'Renamed.');
  };

  const saveSeats = (seats: number) => {
    setSeating(false);
    void run('seats', () => setSeatLimit(seats), `Seats set to ${seats}.`);
  };

  const promote = (member: TeamMemberCard) => {
    setSheetFor(null);
    const who = firstName(member);
    void run('role', () => changeRole(member.id, 'admin'), `${who} is an admin now.`);
  };

  const demote = (member: TeamMemberCard) => {
    setSheetFor(null);
    const who = firstName(member);
    void run('role', () => changeRole(member.id, 'coach'), `${who} is a coach again.`);
  };

  const revoke = (member: TeamMemberCard) => {
    setSheetFor(null);
    void run('revoke', () => revokeInvite(member.id), 'Invitation cancelled.');
  };

  /**
   * "Send a new invite" is a cancel and a fresh invite, and the sheet says so.
   *
   * The alternative was rebuilding the invitation message on the phone so the
   * old link could be re-opened — a second copy of copy the server already
   * owns, which is exactly the drift the OTP resend ladder is a warning about.
   * A new invitation is one call, one source of truth, and a fresh expiry, which
   * is what "send it again" means anyway.
   */
  const resend = async (member: TeamMemberCard) => {
    setSheetFor(null);
    const phone = member.invitedPhone;
    if (!phone) {
      setNotice('No number on that invitation.');
      return;
    }
    setBusy('resend');
    setNotice(null);
    try {
      await revokeInvite(member.id);
      const invite = await inviteCoach(phone);
      await syncDatabase('team');
      refresh();
      if (invite.whatsappUrl) {
        try {
          await Linking.openURL(invite.whatsappUrl);
        } catch {
          setNotice('New invite created, but WhatsApp wouldn’t open.');
        }
      }
    } catch (e) {
      setNotice(e instanceof TeamError ? e.message : 'Could not send that again.');
    } finally {
      setBusy(null);
    }
  };

  const confirmed = () => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;

    switch (target.kind) {
      case 'leave':
        void run('leave', leaveTeam, 'You’ve left the team. Your clients are still yours.');
        return;
      case 'delete':
        void run('delete', deleteTeam, 'Team deleted. Every coach kept their own clients.');
        return;
      case 'remove':
        void run(
          'remove',
          () => removeMember(target.member.id),
          `${firstName(target.member)} is out of the team. Their clients are still theirs.`,
        );
        return;
      case 'owner':
        void run(
          'owner',
          () => transferOwnership(target.member.id),
          `${firstName(target.member)} owns the team now. You’re an admin.`,
        );
    }
  };

  const actions = sheetFor ? memberActions(input, sheetFor) : NO_ACTIONS;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.pad}>
        <AppBar
          title={view.empty ? 'Team' : view.name}
          subtitle={view.empty ? undefined : view.subtitle}
          leading={<IconButton icon={IconBack} label="Back" bare onPress={() => navigation.goBack()} />}
          actions={
            view.empty ? undefined : (
              <IconButton icon={IconDots} label="Team options" bare onPress={() => setMenuOpen(true)} />
            )
          }
        />
      </View>

      <Reveal ready={ready} skeleton={<TeamSkeleton />} style={styles.reveal}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* One banner for the whole screen rather than a refusal per button.
              The trainer's signal is not a property of the button they aimed at. */}
          {offline ? (
            <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
              You’re offline. Your team is here to read — changes need a connection.
            </Banner>
          ) : null}

          {view.empty ? (
            <NoTeam
              invitations={invitations.rows}
              offline={offline}
              busy={busy !== null}
              onOpenInvitation={(inv) =>
                navigation.navigate('TeamInvitation', {
                  invitationId: inv.id,
                  teamName: inv.teamName,
                  invitedByName: inv.invitedByName,
                })
              }
              onCreate={() => setCreating(true)}
            />
          ) : (
            <>
              {view.seats ? <Text style={styles.seats}>{view.seats}</Text> : null}

              {view.seatsFull ? (
                <Banner
                  tone="error"
                  style={styles.banner}
                  onPress={view.caps.canEditTeam ? () => setSeating(true) : undefined}
                >
                  {view.caps.canEditTeam
                    ? 'Every seat is taken. Tap to raise the limit, or remove a coach first.'
                    : 'Every seat is taken. The owner can raise the limit.'}
                </Banner>
              ) : null}

              {/* The two things a team is FOR, above the list of who is in it.
                  The coach list answers "who", these answer "so what" — and an
                  admin opening this screen is almost always on their way to one
                  of them rather than to a membership change. */}
              <SettingList style={styles.destinations}>
                {view.caps.canSeeTeamClients ? (
                  <Setting
                    icon={IconUsers}
                    label="Team clients"
                    meta="Every coach's roster, who's drifting, and handovers"
                    wrap
                    onPress={() => navigation.navigate('TeamClients')}
                  />
                ) : null}
                <Setting
                  icon={IconLayers}
                  label="Team programs"
                  meta="Copy any coach's plan into your own shelf"
                  wrap
                  onPress={() => navigation.navigate('TeamLibrary')}
                />
                {/* Any member, not just admins — this is the record of what was
                    done to THEIR clients, and it is the reason admin editing is
                    acceptable at all. Badged with nothing: it is a log, not a job. */}
                <Setting
                  icon={IconShield}
                  label="Recent changes"
                  meta={
                    view.caps.isAdmin
                      ? 'What the team has changed on each other\u2019s clients'
                      : 'What teammates have changed on your clients'
                  }
                  wrap
                  onPress={() => navigation.navigate('TeamActivity')}
                />
                {view.caps.isOwner ? (
                  <Setting
                    icon={IconRupee}
                    label="Team earnings"
                    meta="Monthly totals per coach. No payments, no client names"
                    wrap
                    onPress={() => navigation.navigate('TeamRevenue')}
                  />
                ) : null}
              </SettingList>

              {view.caps.canInvite ? (
                <Button
                  label="Invite a coach"
                  variant="secondary"
                  size="lg"
                  block
                  icon={IconUserAdd}
                  disabled={offline || view.seatsFull}
                  onPress={() => navigation.navigate('InviteCoach')}
                  style={styles.invite}
                />
              ) : null}

              {view.sections.map((section, index) => (
                <View key={section.key} style={styles.section}>
                  {section.label ? (
                    <SectionHead
                      label={section.label}
                      count={section.members.length}
                      first={index === 0}
                    />
                  ) : null}
                  <List>
                    {section.members.map((member) => (
                      <Row
                        key={member.id}
                        grouped
                        leading={<Avatar name={member.name ?? ''} size="sm" />}
                        title={member.display}
                        subtitle={member.meta || undefined}
                        dim={member.pending}
                        trailing={
                          <Tag
                            label={member.badge}
                            tone={member.pending ? 'warn' : member.isMe ? 'accent' : 'neutral'}
                          />
                        }
                        // Tappable only where there is something to do. A row
                        // that opens an empty sheet teaches the trainer that
                        // rows do nothing.
                        onPress={
                          hasActions(memberActions(input, member))
                            ? () => setSheetFor(member)
                            : undefined
                        }
                      />
                    ))}
                  </List>
                </View>
              ))}

              {/* The promise the money book rests on, on the screen where it
                  matters. Not decoration. */}
              <Callout icon={IconLock} style={styles.note}>
                <CalloutStrong>Nobody sees anybody else’s money.</CalloutStrong> Packages and
                payments stay with the coach who collected them, at every role — including yours.
              </Callout>

              {view.caps.isAdmin ? (
                <Callout icon={IconUsers} style={styles.note}>
                  Admins can see the team’s clients and their training. Handing clients between
                  coaches is coming next.
                </Callout>
              ) : null}
            </>
          )}
        </ScrollView>
      </Reveal>

      {menuOpen ? (
        <Pressable style={styles.menuLayer} onPress={() => setMenuOpen(false)}>
          <Menu
            style={styles.menu}
            actions={[
              ...(view.caps.canEditTeam
                ? [
                    {
                      key: 'rename',
                      label: 'Rename team',
                      icon: IconEdit,
                      onPress: () => {
                        setMenuOpen(false);
                        setRenaming(true);
                      },
                    },
                    {
                      key: 'seats',
                      label: view.seats ? 'Team seats' : 'Set a seat limit',
                      icon: IconGrid,
                      onPress: () => {
                        setMenuOpen(false);
                        setSeating(true);
                      },
                    },
                  ]
                : []),
              ...(view.caps.canLeave
                ? [
                    {
                      key: 'leave',
                      label: 'Leave the team',
                      icon: IconLogout,
                      onPress: () => {
                        setMenuOpen(false);
                        setConfirm({ kind: 'leave' });
                      },
                    },
                  ]
                : []),
              ...(view.caps.canDeleteTeam
                ? [
                    {
                      key: 'delete',
                      label: 'Delete the team',
                      icon: IconTrash,
                      onPress: () => {
                        setMenuOpen(false);
                        setConfirm({ kind: 'delete' });
                      },
                    },
                  ]
                : []),
            ]}
          />
        </Pressable>
      ) : null}

      <CoachSheet
        member={sheetFor}
        actions={actions}
        offline={offline}
        onClose={() => setSheetFor(null)}
        onPromote={() => sheetFor && promote(sheetFor)}
        onDemote={() => sheetFor && demote(sheetFor)}
        onRemove={() => sheetFor && setConfirmFor(setSheetFor, setConfirm, sheetFor, 'remove')}
        onRevoke={() => sheetFor && revoke(sheetFor)}
        onResendInvite={() => sheetFor && void resend(sheetFor)}
        onMakeOwner={() => sheetFor && setConfirmFor(setSheetFor, setConfirm, sheetFor, 'owner')}
      />

      <CreateTeamSheet
        visible={creating}
        suggestion={gymName}
        busy={busy === 'create'}
        onCreate={create}
        onClose={() => setCreating(false)}
      />

      <RenameSheet
        visible={renaming}
        title="Rename this team"
        meta="Coaches see the new name; nothing else changes."
        current={view.name}
        onSave={rename}
        onClose={() => setRenaming(false)}
      />

      <SeatsSheet
        visible={seating}
        current={input.team?.seatLimit ?? null}
        inUse={view.activeCount}
        busy={busy === 'seats'}
        onSave={saveSeats}
        onClose={() => setSeating(false)}
      />

      {/* Each dialog states the consequence rather than asking "are you sure" —
          the whole reason these actions are misread is that their names sound
          worse (or better) than what they do. */}
      <Dialog
        visible={confirm?.kind === 'leave'}
        title="Leave this team?"
        confirmLabel="Leave"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmed}
      >
        Your clients, sessions and money stay yours — you’ll just stop seeing the team, and they’ll
        stop seeing your clients.
      </Dialog>

      <Dialog
        visible={confirm?.kind === 'delete'}
        title="Delete this team?"
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmed}
      >
        Every coach keeps their own clients, programs and payments. What goes is the team itself —
        the shared library and everyone’s view of each other.
      </Dialog>

      <Dialog
        visible={confirm?.kind === 'remove'}
        title={
          confirm?.kind === 'remove' ? `Remove ${firstName(confirm.member)}?` : 'Remove this coach?'
        }
        confirmLabel="Remove"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmed}
      >
        <>
          They keep every client, session and rupee — <DialogStrong>nothing moves</DialogStrong>.
          You’ll stop seeing their clients, and they’ll stop seeing the team.
        </>
      </Dialog>

      <Dialog
        visible={confirm?.kind === 'owner'}
        title={
          confirm?.kind === 'owner' ? `Make ${firstName(confirm.member)} the owner?` : 'Hand over?'
        }
        confirmLabel="Hand over"
        confirmVariant="primary"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmed}
      >
        They’ll be able to rename the team, remove admins and delete it. You stay on as an admin,
        and only they can hand it back.
      </Dialog>

      {notice ? (
        <Toast style={styles.toast} action={{ label: 'Dismiss', onPress: () => setNotice(null) }}>
          {notice}
        </Toast>
      ) : null}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------ the no-team page */

/**
 * Not an empty list — a page about what a team is for.
 *
 * Invitations come first when there are any, because a trainer who was invited
 * is on this screen *because of the invitation*, and making them read a pitch
 * for creating their own team first would be answering a question they did not
 * ask.
 */
function NoTeam({
  invitations,
  offline,
  busy,
  onOpenInvitation,
  onCreate,
}: {
  invitations: TeamInvitationDto[];
  offline: boolean;
  busy: boolean;
  onOpenInvitation: (invitation: TeamInvitationDto) => void;
  onCreate: () => void;
}) {
  return (
    <>
      {invitations.length > 0 ? (
        <View style={styles.section}>
          <SectionHead
            label="You’ve been invited"
            count={invitations.length > 1 ? invitations.length : undefined}
            first
          />
          <List>
            {invitations.map((invitation) => (
              <Row
                key={invitation.id}
                grouped
                leading={<Avatar name={invitation.teamName} size="sm" square />}
                title={invitation.teamName}
                subtitle={`${invitation.invitedByName?.trim() || 'A trainer'} invited you to coach here`}
                trailing={<Tag label="New" tone="accent" />}
                onPress={() => onOpenInvitation(invitation)}
              />
            ))}
          </List>
        </View>
      ) : null}

      <Empty
        icon={IconUsers}
        title={invitations.length > 0 ? 'Or start your own team' : 'No team yet'}
        body="A team lets you bring other trainers in, share one exercise library and copy each other’s programs. Your clients, your sessions and your money book stay yours."
        action={
          <Button
            label="Create a team"
            variant="primary"
            size="lg"
            icon={IconUsers}
            disabled={offline || busy}
            onPress={onCreate}
          />
        }
        style={styles.empty}
      />

      <Callout icon={IconLock} style={styles.note}>
        Whatever happens to a team, <CalloutStrong>no coach ever sees another’s money</CalloutStrong>
        . That holds for you as the owner too.
      </Callout>
    </>
  );
}

/* ------------------------------------------------------------------ plumbing */

const NO_ACTIONS = {
  canPromote: false,
  canDemote: false,
  canRemove: false,
  canRevokeInvite: false,
  canMakeOwner: false,
};

function hasActions(actions: typeof NO_ACTIONS): boolean {
  return (
    actions.canPromote ||
    actions.canDemote ||
    actions.canRemove ||
    actions.canRevokeInvite ||
    actions.canMakeOwner
  );
}

/** Close the sheet, then raise the dialog — two layers never overlap. */
function setConfirmFor(
  closeSheet: (member: TeamMemberCard | null) => void,
  ask: (confirm: Confirm) => void,
  member: TeamMemberCard,
  kind: 'remove' | 'owner',
) {
  closeSheet(null);
  ask({ kind, member });
}

/** "Priya" out of "Priya Nair" — a phone number stays whole. */
function firstName(member: TeamMemberCard): string {
  const name = member.name?.trim();
  if (!name) return member.display;
  return name.split(' ')[0];
}

function TeamSkeleton() {
  return (
    <View style={styles.body}>
      <Skeleton height={44} round={12} style={styles.skelInvite} />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: space.inset },
  reveal: { flex: 1 },
  body: { paddingHorizontal: space.inset, paddingBottom: space.s10 },
  banner: { marginBottom: space.s4 },
  seats: { fontSize: 13, color: colors.ink3, marginBottom: space.s3 },
  destinations: { marginBottom: space.s4 },
  invite: { marginBottom: space.s4 },
  section: { marginBottom: space.s4 },
  note: { marginTop: space.s2 },
  empty: { marginTop: space.s4 },
  menuLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
  },
  menu: { alignSelf: 'center' },
  skelInvite: { marginBottom: space.s4 },
  toast: { marginHorizontal: space.inset, marginBottom: space.s3 },
});
