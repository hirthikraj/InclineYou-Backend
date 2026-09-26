import 'server-only';

/**
 * §5's *What my trainer can see* — **"a plain-language list. Not buried in a
 * policy: an actual screen."**
 *
 * The spec calls this "the one most products skip, and the one that builds
 * trust fastest", and it is the only screen in this portal whose content is a
 * claim about the SOFTWARE rather than about the client. That makes it the one
 * screen that can quietly become a lie: every row below is a promise, and a
 * feature added next month can falsify one without anybody editing this file.
 *
 * ── SO IT IS DERIVED FROM THE WIRE, NOT WRITTEN AS COPY ──────────────────────
 *
 * Each row names the ROUTE or the TABLE it is about. That does not make it
 * self-updating — nothing can — but it makes the list greppable: somebody
 * adding a reader for `assessment` finds this file by searching for the table,
 * where they would never find a paragraph of prose. The `sources` field is
 * there for exactly that, and it is not rendered.
 *
 * ── AND THE `no` LIST IS THE HALF THAT DOES THE WORK ─────────────────────────
 *
 * §5's example is mostly a negative — *"Rahul cannot see your phone's health
 * data"* — because a list of what somebody CAN see reads as a warning however
 * it is worded, and the reassurance is in the boundary. Three of the four
 * negatives below are facts about this product's architecture rather than
 * policy choices, and each says which.
 */

export interface VisibilityRow {
  /** What the trainer sees, in the client's words. */
  what: string;
  /** Why they see it — the coaching reason, not the technical one. */
  why: string;
  /** Tables and routes this row is a promise about. NOT rendered. */
  sources: string[];
}

export interface VisibilityLimit {
  what: string;
  /** Why not. Where it is architectural rather than a choice, it says so. */
  why: string;
  sources: string[];
}

export function canSee(trainerFirstName: string): VisibilityRow[] {
  return [
    {
      what: 'Every workout you log — the exercises, the weights, the reps',
      why: `This is how ${trainerFirstName} writes next week's programme. It is the whole point of logging.`,
      sources: ['workout_session', 'set_log', 'GET /v1/workouts', 'GET /v1/workouts/sets'],
    },
    {
      what: 'How each session felt — easy, just right, or hard',
      why: `Your answer at the end of a workout goes to ${trainerFirstName} and changes what you are given next.`,
      sources: ['workout_feedback', 'POST /v1/me/workouts/{id}/finish'],
    },
    {
      what: 'Your weight and your measurements',
      why: 'Every reading from an assessment, whether you answered it or it was taken with you in a session.',
      sources: ['assessment.readings', 'GET /v1/clients/{id}/body-metrics'],
    },
    {
      what: 'Whether you turned up — and when you did not',
      why: 'Your attendance, session by session. It is also what your session pack is counted against.',
      sources: ['scheduled_session.status', 'GET /v1/sessions'],
    },
    {
      what: 'Your name, your phone number and your session pack',
      why: `${trainerFirstName} added you, so they hold your contact details and what you have paid for.`,
      sources: ['client', 'package', 'payment'],
    },
    {
      what: 'Anything you write in your health and injury notes',
      why: 'That field exists so your trainer reads it before a session. Leave out anything you would rather they did not have.',
      sources: ['client.metadata.health', 'PATCH /v1/me'],
    },
  ];
}

export function cannotSee(trainerFirstName: string): VisibilityLimit[] {
  return [
    {
      /* §5's own example, and it is architectural: this product integrates with
         no health platform. `MOBILE-UX-PHASES.md` files wearables under what is
         cut, so there is no reader to grant. */
      what: 'Anything on your phone',
      why: 'InclineYou is not connected to Apple Health, Google Fit or any watch. There is nothing there for us to read, so there is nothing to share.',
      sources: ['no health-platform integration exists'],
    },
    {
      /* Also architectural, and the one negative a multi-roster client most
         needs — `/sign-in/role`'s own trust line makes the same promise. */
      what: 'Another trainer you work with',
      why: 'If your number is on two rosters, each trainer sees only their own sessions with you. Neither can see the other.',
      sources: ['client rows are per trainer', 'ClientSyncController re-checks the phone'],
    },
    {
      /* Architectural too, and it is the row that made `client_prefs` the right
         home for §14's nominee: this is the only table in the book the
         trainer's half never reads — no trainer route projects it and no
         trainer write touches it. So the promise holds for anything kept here
         and would not hold one row over, on `client.metadata`, where the health
         text lives and where a trainer's own pause write read-modify-writes the
         whole object. `mock/types.ts` carries that argument at length.

         The nominee is named explicitly rather than left under "settings",
         because it is two facts about a THIRD person who never agreed to be in
         this product, and a client deciding whether to type a relative's number
         into a fitness app is owed the answer before they do. */
      what: 'Your notification settings, whether you have hidden your weight, or who you have named to act for you',
      why: 'Those are yours. Your trainer cannot see them and cannot change them.',
      sources: ['client_prefs', 'client_prefs.nominee', 'PATCH /v1/me/prefs'],
    },
    {
      what: 'Anything you have not put in',
      why: `There is no food diary, no step count and no photos in this app. If you have not written it down, ${trainerFirstName} does not have it.`,
      sources: ['nutrition, progress photos and wearables are all out of scope'],
    },
  ];
}

/**
 * The one thing on this screen that is about the TRAINER's privacy rather than
 * the client's, and §5 needs it said: a client reading *what can my trainer
 * see* will assume the answer is symmetrical, and it is not.
 *
 * `ClientNoteRow` is the trainer's private file — "knee still clicking on
 * step-ups", written to be read by the person who wrote it — and
 * `mock/types.ts` argues that a note is candid *because* it is not addressed to
 * anybody. So the export withholds it, and this sentence is why the client is
 * not surprised by that.
 */
export const TRAINER_KEEPS_NOTES =
  'Your trainer also keeps private coaching notes on their own side. Those are theirs, ' +
  'they are not part of your record here, and they are not in your download.';
