/**
 * 6c · one coach, and what you can do about them.
 *
 * A sheet rather than a screen: it is three actions on a row that is already on
 * screen, and pushing a screen to hold three buttons loses the list the trainer
 * was reading.
 *
 * ── Why the actions are explained rather than only labelled ───────────────
 *
 * "Remove" on its own is the most dangerous word in this feature, because a gym
 * owner reads it as "take their clients off them" and it does no such thing —
 * removal ends *visibility*, never ownership. Getting that wrong in either
 * direction is expensive: an owner who thinks removal reassigns will remove a
 * coach and lose forty clients from their team view; one who thinks it deletes
 * will never dare. So each destructive row says what it actually does, in the
 * sentence, before the dialog repeats it.
 *
 * Only the actions the caller may take are drawn at all. `memberActions` in
 * `team/team.ts` is the app's copy of the server's `TeamScope`, so a row that
 * appears here is one the server will accept — a disabled row would be the app
 * advertising a permission the trainer does not have.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Banner,
  IconBan,
  IconCloudOff,
  IconShield,
  IconSwap,
  IconTrash,
  IconUser,
  Setting,
  SettingList,
  Sheet,
  Tag,
  colors,
  space,
} from '../../../design';
import { roleExplainer, type MemberActions, type TeamMemberCard } from '../../../team/team';

export interface CoachSheetProps {
  member: TeamMemberCard | null;
  actions: MemberActions;
  offline: boolean;
  onClose: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onRemove: () => void;
  onRevoke: () => void;
  onResendInvite: () => void;
  onMakeOwner: () => void;
}

export default function CoachSheet({
  member,
  actions,
  offline,
  onClose,
  onPromote,
  onDemote,
  onRemove,
  onRevoke,
  onResendInvite,
  onMakeOwner,
}: CoachSheetProps) {
  const visible = member !== null;
  const nothingToDo =
    !actions.canPromote &&
    !actions.canDemote &&
    !actions.canRemove &&
    !actions.canRevokeInvite &&
    !actions.canMakeOwner;

  return (
    <Sheet visible={visible} onClose={onClose}>
      {member ? (
        <>
          <View style={styles.head}>
            <Avatar name={member.name ?? ''} size="md" />
            <View style={styles.headMain}>
              <Text numberOfLines={1} style={styles.name}>
                {member.display}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {member.meta}
              </Text>
            </View>
            <Tag label={member.badge} tone={member.pending ? 'warn' : 'neutral'} />
          </View>

          {/* What their role means, from their side. The person who needs this
              explained is usually the one about to be given it. */}
          {member.pending ? null : <Text style={styles.role}>{roleExplainer(member.role)}</Text>}

          {offline && !nothingToDo ? (
            <Banner tone="offline" icon={IconCloudOff} style={styles.banner}>
              You’re offline. Team changes need a connection — everything here is safe to wait.
            </Banner>
          ) : null}

          {nothingToDo ? (
            <Text style={styles.none}>
              {member.isMe
                ? 'This is you.'
                : 'Only the team owner can change an admin’s role or remove them.'}
            </Text>
          ) : (
            <SettingList style={styles.list}>
              {actions.canRevokeInvite ? (
                <>
                  <Setting
                    icon={IconSwap}
                    label="Send a new invite"
                    // It replaces the invitation rather than re-sending the old
                    // one, and says so: the expiry restarts, and an old link
                    // someone had already opened stops working. Describing this
                    // as "send again" would be the one lie in the sheet.
                    meta="Cancels this one, makes a fresh invitation and opens WhatsApp."
                    wrap
                    onPress={offline ? undefined : onResendInvite}
                  />
                  <Setting
                    icon={IconBan}
                    label="Cancel this invite"
                    meta="They won’t be able to accept it. You can invite them again later."
                    wrap
                    destructive
                    onPress={offline ? undefined : onRevoke}
                  />
                </>
              ) : null}

              {actions.canPromote ? (
                <Setting
                  icon={IconShield}
                  label="Make them an admin"
                  meta="They’ll be able to invite coaches and see the team’s clients. Never anyone’s money."
                  wrap
                  onPress={offline ? undefined : onPromote}
                />
              ) : null}

              {actions.canDemote ? (
                <Setting
                  icon={IconUser}
                  label="Make them a coach again"
                  meta="They keep their own clients and lose sight of everyone else’s."
                  wrap
                  onPress={offline ? undefined : onDemote}
                />
              ) : null}

              {actions.canMakeOwner ? (
                <Setting
                  icon={IconSwap}
                  label="Hand the team over"
                  meta="They become the owner and you become an admin."
                  wrap
                  onPress={offline ? undefined : onMakeOwner}
                />
              ) : null}

              {actions.canRemove ? (
                <Setting
                  icon={IconTrash}
                  label="Remove from the team"
                  // The sentence this whole sheet exists for.
                  meta="Their clients, sessions and money stay theirs — they just leave your team."
                  wrap
                  destructive
                  onPress={offline ? undefined : onRemove}
                />
              ) : null}
            </SettingList>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginBottom: space.s3 },
  headMain: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 13, lineHeight: 18, color: colors.ink3, marginTop: 2 },
  role: { fontSize: 13, lineHeight: 20, color: colors.ink2, marginBottom: space.s4 },
  banner: { marginBottom: space.s3 },
  none: { fontSize: 13, lineHeight: 20, color: colors.ink3, marginBottom: space.s2 },
  list: { marginBottom: space.s2 },
});
