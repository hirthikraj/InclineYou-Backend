/**
 * THE TRAINER'S BELL — api-contract 1.2, tr-b1.
 *
 * What the client portal did since the trainer last looked: six kinds of event, read from the rows that record them, newest
 * first, fourteen days back. Nothing here is a verb — the attention queue holds the worklist and this is the record — so an
 * item carries who it happened to and opens that person's file.
 */
export type BellKind =
  | 'client_joined'
  | 'client_declined'
  | 'client_left'
  | 'client_selfrun_done'
  | 'assessment_submitted'
  | 'feedback_hard';

export interface BellItem {
  key: string;
  kind: BellKind;
  /** Epoch ms of the event itself. */
  at: number;
  client: { id: string; name: string };
  sessionId: string | null;
  /** The decline reason, or the name of an assessment that came back. Never a date of birth. */
  detail: string | null;
}

export interface BellWire {
  items: BellItem[];
  unreadCount: number;
  /** Epoch ms of the last time the trainer opened the bell; null if never. */
  seenAt: number | null;
}

/** The tone plate each kind draws on — the product's own five (`.ntf__ic--*`). */
export type BellTone = 'money' | 'diary' | 'floor' | 'reply' | 'team';

export interface BellLine {
  /** What they did, said after their name. */
  what: string;
  /** One more fact where the event has one. */
  meta: string | null;
  tone: BellTone;
  icon: 'user' | 'dumbbell' | 'check';
}

const DECLINE: Record<string, string> = {
  not_for_me: 'Said it isn’t for them',
  age_requirement: 'Not 18 or over',
};

/**
 * Words for an event. A kind this build does not know — a newer backend — still gets a line rather than a hole, because a
 * silently dropped item would make the badge count something the list does not show.
 */
export function describe(item: BellItem): BellLine {
  switch (item.kind) {
    case 'client_joined':
      return { what: 'joined the portal', meta: null, tone: 'reply', icon: 'user' };
    case 'client_declined':
      return {
        what: 'declined your invitation',
        meta: item.detail ? (DECLINE[item.detail] ?? null) : null,
        tone: 'diary',
        icon: 'user',
      };
    case 'client_left':
      return { what: 'left the portal', meta: null, tone: 'diary', icon: 'user' };
    case 'client_selfrun_done':
      return { what: 'logged a workout of their own', meta: null, tone: 'floor', icon: 'dumbbell' };
    case 'assessment_submitted':
      return { what: 'sent back an assessment', meta: item.detail, tone: 'reply', icon: 'check' };
    case 'feedback_hard':
      return { what: 'found a session hard', meta: null, tone: 'floor', icon: 'dumbbell' };
    default:
      return { what: 'did something in the portal', meta: null, tone: 'reply', icon: 'user' };
  }
}
