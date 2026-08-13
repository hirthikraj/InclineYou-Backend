/**
 * Nudge rules — the if / then set behind screen 4d.
 *
 * The rule the whole file is built around: **every rule defaults to "Ask me
 * first."** One badly timed automated message costs a client, and that is more
 * expensive than any time automation saves. `seedRules` writes `action: 'ask'`
 * for all five and there is no path in this file that flips a rule to `auto`
 * except a trainer choosing it on the editor.
 *
 * Two other limits — the 9am–8pm send window and once per client per seven days
 * — are NOT stored anywhere. They live in `src/nudges/rules.ts` as constants,
 * because a limit that has a row in a table has a settings screen soon after,
 * and these two exist to protect the trainer from themselves.
 */

import { Q } from '@nozbe/watermelondb';
import { database } from './index';
import NudgeRuleModel from './models/NudgeRule';
import { refreshPending, syncDatabase } from './sync';

export const rulesCollection = database.get<NudgeRuleModel>('nudge_rules');

/** The five rules the design ships. A string, so a sixth is a code change. */
export type RuleKind = 'quiet' | 'pack_low' | 'overdue' | 'well_done' | 'birthday';

export type RuleAction = 'ask' | 'auto';

export interface RuleDefault {
  kind: RuleKind;
  threshold: number | null;
  /** Birthday is the one rule that ships off — most trainers don't collect the date. */
  enabled: boolean;
}

/**
 * Order matters: it is the order they appear on the screen, and it is roughly
 * how much money each one is worth. Gone quiet and pack-running-out are the two
 * that keep a client; the birthday is a nicety.
 */
export const RULE_DEFAULTS: RuleDefault[] = [
  { kind: 'quiet', threshold: 7, enabled: true },
  { kind: 'pack_low', threshold: 2, enabled: true },
  { kind: 'overdue', threshold: 3, enabled: true },
  { kind: 'well_done', threshold: null, enabled: true },
  { kind: 'birthday', threshold: null, enabled: false },
];

function after(reason: string) {
  void refreshPending();
  void syncDatabase(reason);
}

/**
 * Writes any of the five rules this trainer is missing.
 *
 * Called on every open of the Nudges screen rather than once at setup, and
 * written to be safe to call repeatedly: it reads what exists, and only creates
 * the kinds that don't. That matters for a trainer who signed up before this
 * build shipped — they have no rules at all and would otherwise see an empty
 * screen with no way to fill it.
 *
 * The `kind` column carries a unique index per trainer on the server, so a
 * second device seeding its own five before the first pull arrives is
 * reconciled there rather than producing ten rows.
 */
export async function seedRules(trainerId: string): Promise<void> {
  const existing = await rulesCollection.query(Q.where('trainer_id', trainerId)).fetch();
  const have = new Set(existing.map((r) => r.kind));
  const missing = RULE_DEFAULTS.filter((d) => !have.has(d.kind));
  if (!missing.length) return;

  await database.write(async () => {
    await database.batch(
      missing.map((d) =>
        rulesCollection.prepareCreate((r) => {
          r.trainerId = trainerId;
          r.kind = d.kind;
          r.threshold = d.threshold;
          // Never anything else. See the note at the top of the file.
          r.action = 'ask';
          r.message = null;
          r.enabled = d.enabled;
          r.orderIndex = RULE_DEFAULTS.findIndex((x) => x.kind === d.kind);
        }),
      ),
    );
  });
  after('seed-nudge-rules');
}

/**
 * The switch on a rule card.
 *
 * Turning a rule off does not clear what it has already queued — the tap map is
 * explicit about that. Anything drafted was drafted because the condition was
 * true at the time, and a trainer who turns off "gone quiet" has not decided
 * that Arjun is fine.
 */
export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  const row = await rulesCollection.find(id);
  await database.write(() => row.update((r) => { r.enabled = enabled; }));
  after('toggle-nudge-rule');
}

/** Everything the rule editor can change. */
export async function updateRule(
  id: string,
  patch: { threshold?: number | null; action?: RuleAction; message?: string | null },
): Promise<void> {
  const row = await rulesCollection.find(id);
  await database.write(() =>
    row.update((r) => {
      if (patch.threshold !== undefined) r.threshold = patch.threshold;
      if (patch.action !== undefined) r.action = patch.action;
      if (patch.message !== undefined) {
        // An empty box means "go back to the built-in wording", not "send a
        // blank message". Null is how that is stored.
        const text = patch.message?.trim();
        r.message = text ? text : null;
      }
    }),
  );
  after('update-nudge-rule');
}
