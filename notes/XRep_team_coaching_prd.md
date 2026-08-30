# XRep — Team Coaching PRD

**Version:** 1.4 · **Dated:** 20 Aug 2026 · **Status:** **All three phases built
on both halves.** Backend: `V26` + `V27`, the `team` package, 29 endpoints, 70
tests. App: schema v19, `api/team.ts`, `team/`, drawer frames 6a–6l. Seats-to-
billing is the only item still open, and only because there is no billing system
to wire them to.

**Corrections in 1.3.** Two things in §4 and §5.2 below were wrong and are fixed
in place, with the reasoning kept because both were found by building:

1. **`nudge_rule` does not move** (§4.2). It has no `client_id` — it is one row
   per trainer per kind with a unique index on the pair — so there is no such
   thing as a client-scoped nudge rule to move, and "moving" them would both take
   rules that were never about this client and collide with that index.
2. **The old coach keeps the client row** (§5.2). Tombstoning it would break
   their money book, which reads names through `client_id` for payments that stay
   theirs by design. It is projected as `archived` instead.

**Purpose:** let a senior trainer run a *team* — invite other trainers, see and
reassign their clients, and share one program library — without weakening the two
invariants the whole backend rests on: ownership is a `trainer_id` query filter,
and the phone on the gym floor works offline.

**Where this comes from.** The growth roadmap already anticipates it (Stage 3,
item 14: "where multiple trainers in one gym already use you, sell the owner the
coach/membership layer top-down"). Hevy Coach's Coaching Team feature is the
reference shape — owner, admins, members, shared library, client reassignment —
and this PRD adopts that shape with three India-specific departures, all in
§1.4.

**What it costs.** One additive Flyway migration (`V26`), one WatermelonDB
migration (schema v19), one new backend package (`team`), and a change to the
sync pull that is the single subtlest piece of work in the feature (§5.2).

---

## Part 0 — The governing principles

Five rules. Each closes a failure mode that would otherwise be found in
production, in someone's money book.

### 0.1 A team is a visibility grant, never a change of owner

Every row in this schema carries `trainer_id`, and eighteen tables filter on it.
Team coaching does **not** rewrite that column in bulk, and does not introduce a
second owner. It introduces a *resolver*: for a caller who is an owner or admin,
the set of trainer ids they may read expands from `{me}` to `{me + my team}`.
`trainer_id` keeps meaning exactly what it has always meant — the coach whose
book this row is in.

The consequence to hold onto: **there is no `team_id` on `client`, `program`,
`payment`, or anything else.** A row belongs to a coach; a coach belongs to a
team; the team is one join away. Denormalising `team_id` onto eighteen tables
would create eighteen places for it to go stale the day a coach leaves.

### 0.2 The default scope does not change

Existing endpoints keep filtering `trainer_id = :me`. Not one of the 63 endpoints
in `API.md` starts returning another coach's data. Team-wide reads live in a new
`/v1/team/**` namespace, which keeps the authorization table in `SecurityConfig`
readable and means a bug in the team resolver cannot leak data through a path
that predates it.

### 0.3 Offline scope stays personal

A device syncs the signed-in coach's own clients, and nothing else. Team-wide
reads are **online-only REST**.

Two reasons, and the second is the one that matters. First, size: making every
admin's phone carry every coach's roster multiplies the local database by team
size, on the cheap Android handsets this product is built for. Second, exposure:
an offline copy is a copy that leaves with the phone. An admin who is removed
from the team on Tuesday should not still be holding a full local mirror of forty
clients' training and payment history on Wednesday. Online-only means removal is
effective immediately.

Three exceptions, all small, all deliberate, all listed in §5.1: the `team` row,
the `team_member` rows, and team custom exercises.

### 0.4 Money is private to the coach who earned it

A team admin can see a teammate's clients, programs, sessions and progress. They
cannot see that teammate's `package`, `payment`, or `gym_settlement` rows.

This is the sharpest departure from "admins can see everything", and it is
deliberate. In an Indian gym the coach's take-home is a percentage split
negotiated individually, often informally, and often not something they want the
next coach along to read off a screen. The money book was the wedge that got the
trainer to adopt XRep at all; making it visible to whoever the gym promotes is
the fastest way to lose them.

**One exception, shipped in Phase 3 and stated here rather than buried in §7:**
`GET /v1/team/revenue` gives the **owner** — not admins — monthly **totals per
coach**. No payment row, no client name, nothing from which "who paid what" can
be derived. It exists because it is what a gym owner is actually buying when the
coach layer is sold to them top-down (growth roadmap, Stage 3), and without it
their P&L is a spreadsheet kept by hand.

That exception cost a copy change, and the cost is the point. Phase 1's
invitation screen promised that *nobody* in a team could see what another coach
had collected. Phase 3 makes that sentence not quite true, so **the app's copy
changed in the same commit that shipped the endpoint** — on 6d and on 6a — rather
than after somebody noticed. The rule the product now states, and can keep, is:
*nobody opens anybody else's money book; the owner sees a monthly total per
coach, and the coaches know they do.* A promise quietly narrowed is worse than one
that was never made.

### 0.5 Reassignment moves the plan, not the history

When a client moves from coach A to coach B, the forward-looking artefacts move
and the record of what happened stays. Details and the precise table list are in
§4; the principle is that A's logged sessions and A's collected payments are
statements of fact about A's work, and rewriting their `trainer_id` would make
both coaches' books wrong at once.

---

## Part 1 — The model

### 1.1 Two new tables and an audit log

**`team`** — one row per team.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | client-generated, like every id here |
| `owner_trainer_id` | UUID NOT NULL → `trainer(id)` | exactly one, always |
| `name` | VARCHAR(120) NOT NULL | the gym or studio name |
| `logo_url` | VARCHAR(500) | nullable; no upload endpoint in v1, the column is the hook |
| `seat_limit` | INT | nullable = unlimited. Enforced on *accept*, not invite |
| `metadata` | JSONB | |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | soft delete, like everything |

**`team_member`** — one row per coach per team, including pending invites.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `team_id` | UUID NOT NULL → `team(id)` | |
| `trainer_id` | UUID → `trainer(id)` | **nullable** — see §2.2, an invite can precede the account |
| `invited_phone` | VARCHAR(15) | the number the invite was sent to; kept after binding, as evidence |
| `role` | VARCHAR(20) NOT NULL | `owner` \| `admin` \| `coach` |
| `status` | VARCHAR(20) NOT NULL | `invited` \| `active` \| `declined` \| `removed` |
| `invited_by_trainer_id` | UUID → `trainer(id)` | who did the inviting |
| `invited_at` / `joined_at` / `declined_at` / `removed_at` | TIMESTAMPTZ | four moments, four columns — same reasoning as `client.membership_status` in V18 |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMPTZ | |

**`client_assignment`** — the reassignment audit log, and the sync tombstone
source (§5.2). Every row is one move.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID PK | |
| `client_id` | UUID NOT NULL → `client(id)` | |
| `team_id` | UUID NOT NULL → `team(id)` | the team it happened inside |
| `from_trainer_id` | UUID NOT NULL → `trainer(id)` | |
| `to_trainer_id` | UUID NOT NULL → `trainer(id)` | |
| `actor_trainer_id` | UUID NOT NULL → `trainer(id)` | the admin who did it — may be neither party |
| `program_action` | VARCHAR(20) NOT NULL | `keep` \| `clear` |
| `note` | VARCHAR(500) | optional reason, shown to both coaches |
| `created_at` | TIMESTAMPTZ NOT NULL | |

No `updated_at`, no `deleted_at`: it is an append-only log of things that
happened. A move made in error is undone by making the opposite move, which
writes a second row. Deleting the evidence is not an available operation.

### 1.2 One team per trainer

Enforced by a partial unique index on `team_member (trainer_id)` where
`status = 'active' AND deleted_at IS NULL`.

Same reasoning as `app_user.role` being exclusive. A coach in two teams makes
three questions unanswerable: which team's library do they see, which team's
admins can read their clients, and whose seat are they occupying. One team, one
answer, and sign-in never has to ask.

A second partial unique index on `team_member (team_id, invited_phone)` where
`status = 'invited'` stops the same number being invited twice into one team.

### 1.3 Roles and what each can do

Three roles, and the owner is not a fourth kind of admin — it is the admin who
cannot be removed.

| Capability | owner | admin | coach |
| --- | :---: | :---: | :---: |
| Full CRUD on **their own** clients, programs, sessions, money | ✓ | ✓ | ✓ |
| See the list of coaches in the team | ✓ | ✓ | ✓ |
| Browse and **copy** any teammate's templates | ✓ | ✓ | ✓ |
| Use any teammate's custom exercises | ✓ | ✓ | ✓ |
| Read a teammate's clients — roster, profile, programs, sessions, progress | ✓ | ✓ | — |
| Reassign a client between coaches | ✓ | ✓ | — |
| Invite a coach | ✓ | ✓ | — |
| Remove a `coach` | ✓ | ✓ | — |
| Promote a `coach` to `admin` | ✓ | ✓ | — |
| Remove or demote an `admin` | ✓ | — | — |
| Edit team name / logo / seat limit | ✓ | — | — |
| Transfer ownership | ✓ | — | — |
| Delete the team | ✓ | — | — |
| Read a teammate's **money book** | — | — | — |
| Edit a teammate's programs or exercises in place | Phase 2 | Phase 2 | — |

Two rows there are decisions rather than transcriptions of Hevy:

- **An admin cannot remove another admin.** Hevy lets admins remove members
  generally. Here, two admins who fall out could remove each other in a race,
  and the loser loses their clients' visibility mid-session. Escalating that to
  the owner costs one WhatsApp message and removes a whole class of incident.
- **Nobody reads a teammate's money.** §0.4.

### 1.4 Where this departs from Hevy

| | Hevy Coach | XRep | Why |
| --- | --- | --- | --- |
| Money visibility | n/a (no money book) | private to the coach | §0.4 |
| Team data offline | n/a (online product) | online-only | §0.3 |
| Invite channel | email | phone + OTP | there is no email anywhere in this product; the phone is the identity |
| Admin removing an admin | allowed | owner only | §1.3 |
| Editing a teammate's programs | day one | Phase 2 | §7 |

### 1.5 What does *not* change

Worth stating plainly, because it is the strongest argument for this design:
**team coaching requires no change to identity or sign-in.** Every team member is
an ordinary `app_user` with `role = 'trainer'`. No new JWT role, no new token
shape, no change to `JwtService`, no change to the OTP flow, and `gym_admin`
stays reserved and unused. A trainer who joins a team signs in exactly as they
did yesterday and gets one extra screen.

---

## Part 2 — Flows

### 2.1 Creating a team

A trainer with no team taps **Create team** in the drawer, types a name, and gets
a `team` row plus a `team_member` row for themselves with `role = 'owner'`,
`status = 'active'`. No approval, no billing gate. The seat limit defaults from
config (`app.team.default-seat-limit`, 5) so that raising it later is an env
change and not a migration.

### 2.2 Inviting a coach

The admin enters a phone number. `TeamPhoneGuard` — a sibling of
`ClientPhoneGuard`, written in the same shape and for the same reason — answers
one of three ways (23 Aug 2026: a number on somebody's roster as a client is no
longer refused — trainer/client duality is allowed, and that number accepts the
same way anyone without a trainer account does, by claiming one first):

| Verdict | `code` | Status | Why |
| --- | --- | --- | --- |
| Available | — | — | includes a number that is already somebody's client |
| Already an active member of some team | `PHONE_ALREADY_IN_TEAM` | 409 | §1.2 |
| It is the caller's own number | `PHONE_IS_SELF` | 422 | |

Like `ClientPhoneGuard`, the refusal never names the other team. "This number is
already part of a coaching team" and it stops there — naming the team would hand
anyone with a phone book a way to enumerate a competitor's staff.

Then one of two things is true:

- **The number already has a trainer account.** The `team_member` row is written
  with `trainer_id` set and `status = 'invited'`. They see the invite on their
  next sign-in, from `GET /v1/team/invitations` — over REST and not through sync,
  because an invitation cannot be answered offline anyway (§5.1). A push goes out
  too, when they have a device token.
- **The number has no account.** The row is written with `trainer_id = NULL` and
  `invited_phone` set. An invite message goes out over WhatsApp. When that number
  completes trainer sign-up (`POST /v1/auth/trainer`), the pending invite is
  bound to the new trainer id and shown immediately — which makes the invite a
  genuine acquisition channel, not just an internal permission grant.

Invites expire after `app.team.invite-expiry-days` (14). An expired invite
answers `TEAM_INVITE_EXPIRED` (410) and can be re-sent.

The invite endpoint sends a real WhatsApp message, so it goes in the `MESSAGING`
rate-limit tier — 10/min. That is the standing rule from `backend/CLAUDE.md`, and
it also happens to be the anti-spam control for this endpoint.

### 2.3 Accepting

The invited trainer accepts or declines. On accept:

1. Seat check. If `active` members already equal `team.seat_limit`, refuse with
   `TEAM_SEAT_LIMIT` (409). Checked here rather than at invite time because
   seats are consumed by people, not by intentions, and an owner should be able
   to invite six people for five seats and let the first five in.
2. The one-team index is the backstop; a concurrent second accept gets a 409.
3. `status = 'active'`, `joined_at = now()`, `role = 'coach'`.

Nothing about their existing clients changes. They keep every client, program and
rupee they had before joining — joining a team is additive to a coach's own book,
which is what makes it safe to say yes to.

### 2.4 Leaving and being removed

- A coach can **leave** at any time (`DELETE /v1/team/members/me`). Their clients
  stay theirs.
- An admin can **remove** a coach. Their clients stay theirs too, and this is the
  important part: removal ends *visibility*, not *ownership*. If the gym wants
  the clients to stay with the gym, an admin reassigns them first, deliberately,
  which writes `client_assignment` rows — an audit trail — rather than having
  forty clients silently change hands as a side effect of a removal.
- The **owner cannot be removed** (`CANNOT_REMOVE_OWNER`, 422) and cannot leave
  without transferring ownership first.
- **Deleting a team** soft-deletes `team` and all `team_member` rows. Every coach
  keeps everything. Nothing cascades into client data, ever.

### 2.5 Transferring ownership

Owner picks an `active` member. In one transaction: the target becomes `owner`,
the old owner becomes `admin`, `team.owner_trainer_id` is updated. Owner-only,
irreversible without the new owner's cooperation, and confirmed twice in the app.

---

## Part 3 — The shared library

### 3.1 Templates are copied, not shared in place

Any active member can list and read every teammate's templates
(`GET /v1/team/templates`) and copy one into their own book
(`POST /v1/team/templates/{id}/copy` → `201`, a new template with
`trainer_id = me` and fresh ids for every day and exercise row).

Copy rather than share-in-place, for one reason: a template that two coaches use
and one coach edits is a template that silently changed under the other's
clients. Ordinal day slots (V24) make copies cheap and self-contained — a copied
template carries its own days and needs nothing from the original.

Editing a teammate's template in place is the Phase 2 admin capability (§7).

### 3.2 Custom exercises are shared in place

`exercise` rows with `is_custom = true` are visible to the whole team, and this
is the one exception to §0.3 that enters the offline scope. The sync pull filter
changes from:

```sql
WHERE (is_custom = false OR trainer_id = :tid::uuid)
```

to the same thing with `trainer_id IN (:teamTrainerIds)`, where the set is `{me}`
for a coach with no team.

It has to be this way. A copied template referencing a teammate's custom exercise
is unreadable on a phone that does not have that exercise row — the trainer opens
a program on the gym floor and sees a blank line. Custom exercises are a few
hundred bytes each and rarely number more than a few dozen per team, so carrying
the team's set is cheap; carrying the team's clients is not. That is the whole
distinction §0.3 is drawing.

Editing a teammate's custom exercise stays admin-only and Phase 2. Copying a
template never mutates the exercise it points at.

---

## Part 4 — Client reassignment

The feature admins actually asked for, and the one with the most ways to go
wrong.

### 4.1 What the admin does

From a teammate's client detail: **Reassign to another coach** → pick the target
coach (any `active` member, including the admin themselves) → choose what happens
to the training plan:

- **Keep the current program** — the plan moves with the client. The new coach
  can edit it.
- **Start fresh** — the active program is soft-deleted; the new coach builds one.

Optionally a note, which both coaches see.

`POST /v1/team/clients/{clientId}/reassign` with
`{ "toTrainerId": "…", "programAction": "keep" | "clear", "note": "…" }`.

### 4.2 What moves and what stays

One transaction.

**Moves** — `trainer_id` is rewritten:

| Table | Which rows | Why |
| --- | --- | --- |
| `client` | the row | the assignment itself |
| `program` | all non-deleted programs for that client | when `programAction = 'keep'`; the new coach must be able to edit the plan they are now delivering |
| `scheduled_session` | future rows only (`start_at >= now()`, status `scheduled`) | tomorrow's session is the new coach's job; it must appear in *their* diary |

**Does not move, and this was a mistake in v1.0 of this document:**
`nudge_rule`. It carries no `client_id` at all — the table is one row per trainer
per kind, with a unique index on `(trainer_id, kind)`. There is nothing
client-scoped to move, and moving a trainer's rules would take rules that were
never about this client and then violate that index when the target coach already
had one of the same kind. `TeamReassignTest` pins that it is untouched.

**Stays** — `trainer_id` untouched:

| Table | Why |
| --- | --- |
| `workout_session`, `workout_exercise`, `set_log` | a logged session is a statement about who ran it |
| `scheduled_session` (past, and any `done`/`cancelled`) | same |
| `package`, `payment`, `gym_settlement` | the money went to a specific coach under a specific split. Rewriting it makes both books wrong at once (§0.5) |
| `weekly_report`, `nudge_log` | records of messages that were actually sent, by a specific person |
| `body_metric` | has no `trainer_id` — it hangs off `client_id` and needs nothing |

`programAction = 'clear'` soft-deletes the client's programs instead of moving
them (`deleted_at = now()`), which the sync pull already propagates as a tombstone
to the old coach's device by the existing mechanism.

**Two tables are `updated_at`-stamped without otherwise changing:**
`program_exercise` and `body_metric`. Sync is a cursor over `updated_at`, so a row
whose *visibility* changed but whose contents did not would never reach the new
coach's phone — they would inherit a program with no exercises in it, and a client
with no measurement history. Stamping them is the honest reading: the row is
different now, to somebody.

Then one `client_assignment` row, and a push to both coaches.

### 4.3 The consequence to be honest about

The new coach opens the client and sees the training history but **not the
payment history** — because the payments are not theirs. The client's money book
shows what the new coach has collected, starting empty.

This is the correct behaviour under §0.4 and §0.5, and it is also the thing a gym
owner will file as a bug within a week. It needs to be *visible in the UI* rather
than merely true in the database: the client detail shows "Payments before
20 Aug 2026 are recorded with Ravi Kannan" so nobody thinks the data was lost.
The team revenue roll-up in Phase 3 (§7) is the real answer for the owner who
wants one number across both coaches.

### 4.4 Guards

- Target coach must be an `active` member of the caller's team →
  `MEMBER_NOT_IN_TEAM` (404).
- Client's current coach must be an `active` member of the caller's team →
  `CLIENT_NOT_IN_TEAM` (404). An admin cannot reach outside their team.
- Reassigning to the current coach is a no-op, `200`, no audit row.
- The client's phone does not need re-checking: they are moving *within* a team,
  their `app_user` row is unchanged, and `ClientPhoneGuard` cares about
  cross-trainer collisions that this move cannot create — the row is not
  duplicated, it is updated.
- `membership_status` is untouched. A client who accepted coaching from the gym
  does not get re-invited because the gym changed who delivers it. Whether that
  is the right call is worth revisiting if trainers complain that clients are
  surprised; a push notification to the client — "Priya is your coach from
  Monday" — is the cheaper answer and is in scope for v1.

---

## Part 5 — Sync

### 5.1 What enters the offline scope

Three additions to `/v1/sync/pull`, and nothing else:

| Table | Rows | Push? |
| --- | --- | --- |
| `team` | the caller's one team | pull-only, server-authored |
| `team_member` | all members of that team | pull-only, server-authored |
| `exercise` | widened to team custom exercises (§3.2) | unchanged — a coach still only writes their own |

`team` and `team_member` are pull-only because every write to them is a
permission change, and a permission change that can be authored offline on a
phone and replayed later is a permission change that can be replayed *after the
grant was revoked*. Both tables are read-only in the WatermelonDB schema and the
app writes them through REST while online, or not at all. A push containing
either is refused with `TEAM_READ_ONLY` in the existing structured-rejection
channel (`SyncService.Rejection`) rather than silently dropped.

Everything team-wide — teammates' clients, their programs, their sessions — is
**not** in sync. It is fetched from `/v1/team/**` when online and not stored
locally (§0.3).

### 5.2 The reassignment tombstone — the one genuinely hard part

The pull filters `trainer_id = :tid`. When a client is reassigned away from coach
A, their rows stop matching A's filter. They therefore appear in neither
`updated` nor `deleted`, and **the client stays on A's phone forever** — a live,
editable, invisible-to-the-server copy of someone else's client. Every write A
makes to it gets pushed and rejected, or worse, accepted.

This is not a corner case. It happens on the first reassignment the first team
ever performs.

**As built, this is two mechanisms rather than one, and the second one was not
in v1.0 of this document.**

### What is deleted locally: the rows that really did move

`client_assignment` is the tombstone source. For each table whose rows moved:

```sql
SELECT DISTINCT t.id::text FROM <program | scheduled_session> t
JOIN client_assignment ca ON ca.client_id = t.client_id
                         AND ca.from_trainer_id = :tid::uuid
WHERE t.trainer_id <> :tid::uuid
  AND GREATEST(t.updated_at, ca.created_at) > :cursor
```

Simpler than the `NOT EXISTS` formulation first drafted here, and better:
`trainer_id <> :tid` **is** the test, so A → B → A needs no "unless a later move
brought them back" clause — the row is mine again, the condition is false, and
nothing is deleted. There is no ordering to get wrong and no history to walk.
`GREATEST(…, ca.created_at)` is the other half: the rows themselves may not have
changed since the cursor, their *owner* did, so the assignment's own timestamp is
what carries them past it.

`program_exercise` needs the same branch through two joins, because it carries
neither a `trainer_id` nor a `client_id` — and it needs it *more* than the program
does: WatermelonDB does not cascade, so a program deleted locally without its
exercises leaves orphan rows the program screen draws as empty days.

Both properties hold: **idempotent** (two pulls with the same cursor produce the
same deletions; deleting an absent record is a no-op in WatermelonDB) and
**convergent** (the new coach's pull emits the same rows as `updated` in the same
window, whichever device syncs first).

### What is NOT deleted locally: the client

The obvious move is to tombstone the client on the old coach's phone. It is also
wrong, and expensively so.

That device still holds their `payment`, `package`, `workout_session` and
`weekly_report` rows for this person — history that stays theirs by §0.5 — and
every one of those resolves a name through `client_id`. Delete the client locally
and the money book, which is the reason this product was adopted at all, starts
drawing payments with no name against them. The money is not moving; the name
cannot leave.

So the pull keeps the row for anyone who has handed that client over:

```sql
(c.trainer_id = :tid::uuid OR EXISTS (
     SELECT 1 FROM client_assignment ca
     WHERE ca.client_id = c.id AND ca.from_trainer_id = :tid::uuid))
```

This is not a widening of what the old coach can see. They coached this person
yesterday and hold their entire history already.

### And it arrives projected as `archived`

The row is **projected, not mirrored**: delivered to the old coach with `status`
overridden to `archived`, which is precisely what this is from their side — not
training with them, history retained, exactly what `archived` has always meant in
this schema.

The pay-off is that **no screen has to learn what a handover is.** The roster, the
deck, the diary and every picker already drop an archived client; the money book
reads history rather than the roster and keeps working. One projection in the pull
replaces a rule threaded through every screen that reads a client.

It is safe in both directions because both write paths in `pushClients` end in
`WHERE client.trainer_id = :tid`, so a phone echoing the projected row back is a
no-op rather than an archive landing on the new coach. `TeamReassignTest` pins
that too, by pushing the projected row and asserting the new coach's client is
still `active`.

Projected in Java rather than in the `SELECT`, incidentally: a `CASE … AS status`
alongside `c.*` relies on which of two same-named result columns the row mapper
keeps, and the schema is additive-only, so listing the columns by hand would
silently drop the next one added.

Deleting locally is safe in a way it usually is not, because nothing is lost: the
rows still exist on the server under the new coach's `trainer_id`. This is a
scope change, and a local delete is how a scope change is expressed to a device
that only ever sees its own slice.

### 5.3 App-side migration

WatermelonDB schema **v19**, one migration appending `team` and `team_member`.
Append only — never edit a `toVersion` that has run (`app/src/db/migrations.ts`,
and the standing law in both `CLAUDE.md` files).

---

## Part 6 — Backend surface

### 6.1 New package

`com.xrep.xrep_backend.team` — `TeamController` over `TeamService`, plus:

- `TeamScope` — resolves, once per request, `(trainerId, teamId, teamRole,
  Set<UUID> visibleTrainerIds)`. `visibleTrainerIds` is `{me}` for a coach or a
  trainer with no team, and every active member for an owner or admin. Every
  team-wide query takes its trainer-id set from here and from nowhere else, so
  there is one place to audit and one place to get it wrong.
- `TeamPhoneGuard` — §2.2, modelled on `ClientPhoneGuard`.
- `ClientReassignService` — §4, the one transaction.

Hand-written SQL through `NamedParameterJdbcTemplate`, matching the surrounding
services; `team` and `team_member` do **not** become JPA entities. The five JPA
entities stay five.

### 6.2 Endpoints

All under `/v1/team`, all `ROLE_TRAINER`, all `STANDARD` tier except the one
noted.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/team` | any member | the team, my role, seat usage. `204` if I have no team |
| `POST` | `/v1/team` | no team | create a team, become owner |
| `PATCH` | `/v1/team` | owner | name, logo, seat limit |
| `DELETE` | `/v1/team` | owner | soft-delete the team |
| `POST` | `/v1/team/transfer-ownership` | owner | §2.5 |
| `GET` | `/v1/team/members` | any member | the coaches, their roles, client counts |
| `POST` | `/v1/team/invites` | admin+ | invite by phone · **`MESSAGING` tier** |
| `POST` | `/v1/team/invites/phone-availability` | admin+ | pre-flight `TeamPhoneGuard`, same shape as `/v1/clients/phone-availability` |
| `DELETE` | `/v1/team/invites/{id}` | admin+ | revoke a pending invite |
| `PATCH` | `/v1/team/members/{id}/role` | see §1.3 | promote / demote |
| `DELETE` | `/v1/team/members/{id}` | see §1.3 | remove a coach |
| `DELETE` | `/v1/team/members/me` | any non-owner | leave |
| `GET` | `/v1/team/clients` | admin+ | team-wide roster, grouped by coach |
| `GET` | `/v1/team/clients/{id}` | admin+ | a teammate's client — profile, programs, sessions, progress. **No money.** |
| `POST` | `/v1/team/clients/{id}/reassign` | admin+ | §4 |
| `GET` | `/v1/team/clients/{id}/assignments` | admin+ | the move history for one client |
| `GET` | `/v1/team/templates` | any member | the shared library |
| `POST` | `/v1/team/templates/{id}/copy` | any member | §3.1 |

Plus, outside the namespace, on the invitee's side:

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/team/invitations` | any trainer | invites addressed to me |
| `POST` | `/v1/team/invitations/{id}/accept` | invitee | §2.3 |
| `POST` | `/v1/team/invitations/{id}/decline` | invitee | |

**21 new endpoints across all three phases — 15 of them Phase 1, which is what is
built. `API.md` total is 63 → 78 today, 84 at full parity,** and the authorization table
gains one row: `/v1/team/**` → `ROLE_TRAINER`. Which is to say it gains nothing —
it already falls through to `anyRequest().hasRole("TRAINER")`. Role checks inside
the team are `TeamScope`'s job, not `SecurityConfig`'s, because they depend on a
database row and not on a path.

### 6.3 New error codes

Added to `GlobalExceptionHandler` and to the table in `API.md` in the same
commit, per the standing rule.

| `code` | Status | Meaning |
| --- | --- | --- |
| `PHONE_IS_CLIENT` | 409 | That number is on a roster as a client. |
| `PHONE_ALREADY_IN_TEAM` | 409 | That number is already in a coaching team. |
| `PHONE_ALREADY_INVITED` | 409 | This team already has an invite out to that number. |
| `PHONE_IS_SELF` | 422 | You cannot invite your own number. |
| `TEAM_SEAT_LIMIT` | 409 | Every seat is taken; carries `seatLimit`. |
| `TEAM_INVITE_EXPIRED` | 410 | Older than the expiry window; re-send. |
| `NOT_TEAM_ADMIN` | 403 | The action needs `owner` or `admin`. |
| `NOT_TEAM_OWNER` | 403 | The action needs `owner`. |
| `TEAM_MEMBERSHIP_REQUIRED` | 403 | You are not in a team. |
| `CANNOT_REMOVE_OWNER` | 422 | Transfer ownership first. |
| `CANNOT_DEMOTE_OWNER` | 422 | The owner's role changes by transfer, not by edit. |
| `TEAM_ROLE_INVALID` | 422 | A member can be made `admin` or `coach`, nothing else. |
| `ALREADY_IN_TEAM` | 409 | You are already in a team (on create/accept). |
| `CLIENT_NOT_IN_TEAM` | 404 | That client's coach is not in your team. |
| `MEMBER_NOT_IN_TEAM` | 404 | That coach is not an active member. |
| `TEAM_READ_ONLY` | — | Sync push rejection reason, not an HTTP status. |

Fifteen rather than the twelve first drafted. The three added while building are
all cases where folding the failure into a neighbour would have left the app
unable to choose a recovery: `PHONE_ALREADY_INVITED` is "revoke it or wait" and
not "they must leave their team", `NOT_TEAM_OWNER` is "ask the owner" and not
"ask to be promoted", and the two owner-immutability refusals are different
sentences on different screens.

Note the `403`s, which look like they contradict the standing convention that a
wrong id yields `404`. They do not. That convention is about *cross-trainer*
ownership, where 404 exists to avoid confirming that another trainer's row is
real. Inside a team, the caller knows the team is real — they are in it — so
"you are not an admin" is honest and 403 is the correct answer. Anything reaching
*outside* the team still 404s: `CLIENT_NOT_IN_TEAM` and `MEMBER_NOT_IN_TEAM` are
both 404 for exactly the old reason.

### 6.4 Configuration

```yaml
app:
  team:
    enabled: ${TEAM_ENABLED:true}              # kill switch, like every feature here
    default-seat-limit: ${TEAM_SEAT_LIMIT:5}
    invite-expiry-days: ${TEAM_INVITE_EXPIRY_DAYS:14}
```

`TEAM_ENABLED=false` makes every `/v1/team/**` endpoint `404` and hides the
drawer entry — the same shape as `BATCHES_ENABLED` and `SELF_TRAINING_ENABLED` on
the app side.

### 6.5 Migration

`V26__team_coaching.sql`. Three `CREATE TABLE`s, four indexes, two partial unique
indexes, three `updated_at` triggers. Zero `ALTER`s to existing tables, zero
backfill, zero drops. Every trainer on the day it ships has no team, which is the
correct starting state and needs no data written to express.

---

## Part 7 — Phasing

**Phase 1 — the team exists. ✅ Backend built, 20 Aug 2026.** `V26`, the `team`
package (`TeamScope`, `TeamPhoneGuard`, `TeamRuleException`, `TeamService`,
`TeamController`), 15 endpoints, the `MESSAGING` tier on invites, 15 error codes,
sync of `team` + `team_member` and the widened `exercises` pull, `app.team.*` with
a `TEAM_ENABLED` kill switch, and 27 tests (`TeamServiceTest`, `TeamSyncTest`).
A team you can form that grants the coach list and the shared exercise pool.
Useful alone. **The Expo app screens are not built.**

One thing built here that the first draft of this PRD did not anticipate: the
sync-tombstone problem of §5.2 is not unique to reassignment. Leaving a team hits
it too — the team row, every teammate's member row, and every team custom
exercise stop *matching* the caller's filter rather than becoming deleted, so all
three would sit on the phone forever. `fetchTeams`, `fetchTeamMembers` and
`fetchExercises` each carry the same shape of fix, keyed off the membership row's
own `updated_at` because when a coach is removed that row is the only thing that
changed. Phase 2's reassignment tombstones are now the *second* instance of a
pattern with tests behind it, rather than the first.

**Phase 1½ — the app.** ✅ Built 20 Aug 2026. See Part 10.

**Phase 2 — visibility and the move.** ✅ Built 20 Aug 2026.
`/v1/team/clients`, the client detail read, reassignment with `client_assignment`,
the shared program library, and the sync work of §5.2 — which landed in the same
commit as the first reassign endpoint, as this document insisted it must. 22 more
backend tests (`TeamReassignTest`, `TeamLibraryTest`). App frames 6f–6i. `/v1/team/clients`, the client detail
read, reassignment with `client_assignment`, and the sync tombstones of §5.2 —
which are Phase 2 work but must be written *in the same commit as the first
reassignment endpoint*, never after. Then the shared template library and copy.

**Phase 3 — admin editing and the owner's numbers.** ✅ Built 20 Aug 2026.
`V27` (`team_activity`), `TeamEditService`, `TeamRevenueService`, 8 endpoints, 16
tests. App frames 6j–6l. Seats-to-billing remains open, for want of a billing
system. Admins editing a teammate's
programs and custom exercises in place. The team revenue roll-up: totals per
coach for a date range, owner-only, no per-payment detail (§0.4, §4.3). Seats
wired to billing, when there is a billing system to wire them to.

Phase 1 and 2 together are the Hevy-parity feature. Phase 3 is what the gym owner
pays for.

---

## Part 8 — Success measures

- **Adoption:** teams formed, and coaches per team. A team of one is a trainer who
  tried the button; a team of three is the feature working.
- **The reassignment test:** a client moved between coaches, with both coaches'
  devices reflecting it within one sync cycle and neither device retaining a stale
  copy. This is the correctness gate for the whole feature; if §5.2 is wrong,
  nothing else matters.
- **Library leverage:** templates copied across coaches per team per month. This
  is the thing a team does that a solo trainer cannot, and the cheapest signal
  that the team is a team rather than a list.
- **No money leaks:** zero `package` / `payment` / `gym_settlement` rows ever
  returned under a `/v1/team/**` path. Assert it in a test, not in a review.

---

## Part 9 — Open questions

1. **Does the client get told?** v1 sends a push — "Priya is your coach from
   Monday". Whether the client can *refuse* a reassignment is unresolved. Saying
   yes means a client can strand a gym's roster; saying no means the arrangement
   they consented to in V18 changed without them. v1 says no, notifies, and
   leaves the decision to be revisited with real trainers.
2. **Gym share on a reassigned client.** `client.trainer_split_percent` moves with
   the client, but the new coach may have negotiated a different split with the
   same gym. v1 moves the value as-is and shows it on the reassign screen so the
   admin can correct it immediately. A per-coach default split is Phase 3.
3. **`gym_admin`.** V18 reserved the role for a gym owner who is not a coach — no
   clients, no diary, just the numbers. This PRD deliberately does not build it:
   an owner who also trains is the common case in India, and `team` + `owner`
   covers them. The day a pure gym owner needs an account, `gym_admin` becomes a
   `team_member` with `role = 'owner'` and no `client` rows, which is a code
   change and not a migration — exactly what reserving the value bought.
4. **Seat limit default of 5.** A guess. It is env-overridable and enforced on
   accept, so it costs nothing to be wrong about it.

---

## Part 10 — The app, as built

Phase 1 on the Expo side. Fifteen endpoints, five frames, one new schema version,
and one deliberate violation of the app's central rule.

### 10.1 Where it lives

**Drawer → Growth → Team**, frames **6a–6e** (the drawer family numbers 2a…8c and
6 was unused).

It is in *Growth* rather than a group of its own because `AppDrawer.tsx` states
two rules in its own header and both decide it: the drawer must not be a second
route to something a tab already owns — Team owns no tab — and *groups of one are
gone*, which is why a "Team" group was not created. Growth is Reports, Adherence
and Nudges: the group for growing the business, and hiring coaches is how a
trainer grows past their own hours.

The drawer is not the discovery path, though. Three entries, and the second one is
the one that matters:

| Entry | Why |
| --- | --- |
| Drawer → Growth → Team, badged with invitations waiting for **you** | For the owner going there on purpose. Badged only with a job — never with the size of the team |
| **A card on Home** whenever an invitation is waiting | The `SyncQueue` precedent: nobody goes looking for a queue, they tap the thing that told them something was waiting. Somebody is waiting on this answer, so it sits above the day |
| The Team screen itself, which leads with invitations when you have no team | A trainer who was invited is on that screen *because of the invitation*; making them read a pitch for creating their own team first answers a question they did not ask |

### 10.2 The frames

| Frame | File | Notes |
| --- | --- | --- |
| **6a** | `screens/main/drawer/TeamScreen.tsx` | Two screens behind one route. No team → invitations, then a page about what a team is for. In a team → seats, invite CTA, coach list ordered owner → admins → coaches → invited |
| **6b** | `InviteCoachScreen.tsx` | Phone field, live availability, then WhatsApp |
| **6c** | `CoachSheet.tsx` | One coach: promote, demote, hand over, remove, or cancel an invite |
| **6d** | `InvitationScreen.tsx` | Answering an invitation. A full screen, because this is consent |
| **6e** | `CreateTeamSheet.tsx` + `SeatsSheet.tsx` | Name a team; change the seat limit |

No design frames existed for any of this — `agent/design system/` holds 11 screens
and team is not among them, the same situation drawer 6a–8c were built under on
15 Aug. Built from the design system directly, which is a choice and not an
oversight.

### 10.3 The one rule this feature breaks

Every other screen in XRep writes to SQLite first. `team/` awaits the server.

Every write to a team is a **permission change**, and one authored offline is one
replayed at an unknown later time — "make Priya an admin", queued Tuesday,
landing Friday, after she left. There is no safe version of that, so the app does
not offer it: the buttons need a connection and say so once, in a banner, rather
than failing one at a time.

Reads are still local, and that is what keeps the screen feeling like the rest of
the app. `teams` and `team_members` are pull-only synced tables (**WatermelonDB
schema v19**, migration `toVersion: 19`, models `Team.ts` / `TeamMember.ts`), so
the coach list draws from an observable with no signal at all.

Three consequences, all load-bearing:

- **`team/team.ts` holds `capabilities()` and `memberActions()` — the app's copy
  of `TeamScope`.** There is no way to have one copy of an authorization rule when
  the server must enforce it and the app must draw it, so the app's copy lives in
  exactly one file, next to the sentence naming the class it mirrors. A button is
  never offered for an action the server will refuse; a row with no available
  action is not tappable at all.
- **Every write calls `syncDatabase('team')` on success.** Without it the screen
  sits on stale local rows until the next foreground or reconnect, and the
  trainer reasonably concludes the button did nothing.
- **Nothing is optimistic.** A promotion that appears to happen and silently
  un-happens is worse than a spinner on one button. Each action shows its own busy
  state; the list re-derives from what the pull brought back.

### 10.4 A teammate's client count comes from the network

The count cannot be local — this phone holds the signed-in trainer's clients and
nobody else's, by §0.3. So `useTeam` layers `/v1/team/members` over a list that
has already drawn, and `clientLine` in `team.ts` is written to read well twice:
the fallback is the join date, not a blank or a shimmer. Same line height, so
nothing moves when the count lands; both versions are true; and offline, where the
count will never arrive, "Joined 12 Jun" is still worth reading. The trainer's own
count is taken from the local table, so their own row is right immediately and
stays right offline.

### 10.5 The invitation exists before WhatsApp opens

`POST /v1/team/invites` is awaited first, and only then is the `wa.me` link
opened. A trainer who backs out of the share sheet has still created a real
invitation, which shows in the coach list as waiting with its own action.
Coupling the invitation's existence to a share sheet nobody can observe would
make the coach list lie about who has been asked.

"Send a new invite" is a revoke plus a fresh invite, and the sheet says exactly
that. The alternative was rebuilding the invitation message on the phone so the
old link could be reopened — a second copy of copy the server owns, which is the
drift the OTP resend ladder exists as a warning about.

### 10.6 What the screens say out loud

Three sentences are on screen rather than only in this document, because a promise
that lives only in a PRD is a promise nobody has been told:

- **"Nobody sees anybody else's money."** On 6a, at every role, including the
  owner's. It is the promise the whole money book rests on and the first question
  a coach asks before joining anything.
- **"Their clients, sessions and money stay theirs — they just leave your team."**
  On the remove action and again in its dialog. "Remove" is the most dangerous
  word in this feature: a gym owner reads it as taking a coach's clients away, and
  it does no such thing. Wrong in either direction is expensive.
- **"Team admins can see your clients' training."** On 6d, the accept screen, as
  the third of three facts. It is the actual cost of joining, it is the one a
  trainer would be annoyed to discover later, and hiding it to raise the accept
  rate would be buying adoption with the trust the product is made of.

Declining is a peer of accepting on that screen — same size, same weight, no scare
copy. A coach who says no in March may say yes in April, and the server allows a
fresh invite for exactly that reason.

### 10.7 Verification

`npm run typecheck` is the whole gate on this side and passes. The Android bundle
was also exported end to end (1,998 modules, no resolution errors), which is the
strongest available check that the module graph and the new schema wiring load —
there is no test suite on the app half.

### 10.8 Not built

Phase 2's screens: the team-wide roster, a teammate's client file, and the
reassign flow. Deliberately deferred — the reassignment UI has to explain the
money-visibility line of §4.3 on screen, and that copy wants a real trainer to
react to it before it is written.

---

## Part 11 — Phase 2, as built

### 11.1 The backend

Two services, six endpoints, no migration — `client_assignment` was already
created by `V26`, which is why Phase 2 needed no schema change at all.

| File | Job |
| --- | --- |
| `team/TeamClientService.java` | the team roster, a teammate's client, the reassign transaction, the move log |
| `team/TeamLibraryService.java` | the shared shelf and the copy |

`TeamScope` is still the only source of the trainer-id set, and it gained one
thing: `visibleTrainerIdArray()`, which renders the set as a Postgres array
literal for `= ANY (CAST(:visible AS uuid[]))`. A bound `IN (:list)` of strings is
a type error against a `uuid` column, and the usual fix — `trainer_id::text IN
(…)` — casts the column and throws away `idx_client_trainer_id` on a table that
holds every trainer's roster. The set still comes from one place; only its
rendering moved.

### 11.2 Two things the build found

**`nudge_rule` cannot move.** §4.2 as first written was wrong twice over. Caught
by reading the migration before writing the UPDATE, and now pinned by a test that
asserts both trainers' rule counts are unchanged by a handover.

**The client row cannot leave the old coach's phone.** §5.2 as first written would
have shipped a broken money book on the first reassignment. The projection is the
fix, and it is a better fix than the alternative — one line in the pull instead of
a "handed over" rule threaded through every screen that reads a client.

### 11.3 The app

| Frame | File | Notes |
| --- | --- | --- |
| **6f** | `TeamClientsScreen.tsx` | The team's roster, grouped by coach, with drift called out |
| **6g** | `TeamClientScreen.tsx` | A teammate's client, read-only, money-free and saying so |
| **6h** | `ReassignSheet.tsx` | Pick a coach, decide the plan, say why |
| **6i** | `TeamLibraryScreen.tsx` | The shared shelf: theirs to copy, yours to open |

Plus `team/roster.ts`, a pure derivation module whose whole job is turning a date
into a reason to act: `lastSessionAt` becomes "Quiet 23 days" and a tone, using
the same 10-day and 21-day thresholds `clients/roster.ts` already uses. Two
screens disagreeing about what "quiet" means would be worse than either threshold
being wrong.

**Entry points.** Team clients and Team programs sit at the top of 6a, above the
coach list — the coach list answers *who is in the team*, and those two answer
*so what*. The team shelf is **also** reachable from Programs (3a), because a
coach hunting for a plan goes to the shelf they already know about, not to the
team screen.

**Three states per screen, honestly.** These are the only screens in XRep with a
real loading state and a real offline dead end, because the data genuinely is not
on the phone and must not be. Each says so and points at the offline thing that
does work — "your own clients are on the Clients tab", "your own programs are
under Programs" — rather than faking a cache. A failed refresh keeps the list that
is already on screen instead of replacing a correct answer from thirty seconds ago
with an error page.

### 11.4 What the reassign sheet has to say

The handover surprises both coaches in opposite directions, and one sheet has to
pre-empt both:

- the **new** coach opens an inherited client and finds no payments — data loss,
  unless they were told the money stayed with whoever collected it;
- the **old** coach expects their books to change and they do not.

So the sheet carries the sentence *"The plan moves, the money doesn't"* with both
coaches named in it, and the confirm button names the outcome — "Hand Meera to
Priya" — rather than saying Confirm. There is no second confirmation dialog: a
handover is reversible and the log keeps both moves, so a Dialog would be ceremony
rather than protection.

### 11.5 Verification

Backend: **107 tests**, `./mvnw -B verify` green. The 22 added ones pin what moves
and what stays, that both devices converge, that a move back heals with no
bookkeeping, that the same pull twice gives the same answer, that the projected
row cannot leak back, and — asserted rather than reviewed — that no money field
appears anywhere in a `/v1/team/**` response.

App: `npm run typecheck` clean and the Android bundle exports (2,003 modules).

### 11.6 Still not built

Phase 3: admins editing a teammate's programs and custom exercises in place, and
the owner's revenue roll-up. 6g says so on screen rather than showing a disabled
edit button — advertising a permission that does not exist is worse than not
offering it.

---

## Part 12 — Phase 3, as built

Two capabilities that pull in opposite directions: one hands an admin more power
over a colleague's work, the other hands an owner a number they were promised
nobody would see. Both needed something built alongside them to stay acceptable.

### 12.1 Editing a teammate's plan, and the record that makes it safe

**The case.** The coach is off sick, their client is on the floor, and the plan
says 5×5 back squat for a shoulder that is not having it. Handing the client over
permanently is the wrong answer to one swapped exercise, and "wait for Priya" is
not an answer at all.

**The scope.** Change a prescription, add an exercise, remove one; edit the plan's
name, goal or status. **No create, no delete** — giving a teammate's client a whole
new plan or taking their plan away are handover-shaped decisions, and the handover
already exists and is audited.

**Templates stay copy-only,** and that is §3.1 rather than an oversight. A
template two coaches use and one coach edits is a template that changed under the
other's clients. A live program belongs to one client and one coach, which is
exactly what makes editing it in place safe to offer at all.

**`V27` · `team_activity` is the thing that makes it acceptable.** A coach who
finds their client's Tuesday different from how they left it, with no way to see
who changed it, has been handed a reason to distrust the whole feature. So every
crossing writes a row with a sentence composed at the time, and pushes to the
coach. Four properties:

- **it records crossings only** — editing your own client writes nothing, because
  there is nobody to account to, and a `CHECK (actor <> subject)` refuses such a
  row in the database as well as in the service;
- **the coach can read it**, not only admins. `GET /v1/team/activity` inverts
  scope by role server-side: a coach sees what happened to their clients, an admin
  sees the team's. A log only its authors could read is an account of nothing;
- **the sentence is stored, not derived**, for the reason `weekly_report` stores
  its sentences: it describes what happened *then*, and rebuilding it from current
  state would produce a different sentence every time the plan changed again;
- **append-only.** No `updated_at`, no `deleted_at`. A change made in error is
  undone by making another change, which writes another row.

**One field the older endpoints drop.** `POST/PATCH /v1/team/programs/{id}/
exercises` carries `durationSeconds` (V25). The pre-existing `/v1/programs/**`
DTOs never gained it, so an admin editing a plank through those would silently
convert a 45-second hold into reps. Pinned by a test.

**Sync needed no work at all**, which is worth stating because it is the first
time in this feature that has been true: an edit does not move `trainer_id`, so
the owning coach's own filter still matches and `updated_at` carries the change to
their phone. There is a test asserting exactly that, precisely because "it works
because we did nothing" is the kind of claim that stops being true after a
refactor.

### 12.2 The owner's numbers

Four limits keep the carve-out narrow, and each closes a way this could have
become a general money-reading power: **owner only** (not admins), **totals
only**, **no client ever named**, **no `gym_settlement`**. `payment.gym_share_
amount` is included because it was stamped on the payment at record time (V11) and
is the owner's half of the same transaction.

Two smaller decisions worth keeping: the range reads **`paid_at`, not
`created_at`** — cash taken Saturday and typed in Monday belongs to Saturday,
which is why that column exists — and a coach who took nothing appears as a
**zero rather than vanishing**, because a missing row reads as "no data" and sends
an owner hunting for a bug.

The copy change this forced is in §0.4 above. It is the most important thing in
this phase.

### 12.3 The app

| Frame | File | Notes |
| --- | --- | --- |
| **6j** | `TeamProgramScreen.tsx` | A teammate's plan, grouped by week and day; tap to change, hold to remove |
| **6k** | `TeamActivityScreen.tsx` | Who changed what, on whose clients |
| **6l** | `TeamRevenueScreen.tsx` | Team earnings per coach. Owner only |
| — | `TeamPrescriptionSheet.tsx` | Seeded with what the coach already wrote |
| — | `ExercisePickSheet.tsx` | Searches the local library, so the *choice* works offline |

Three decisions in there that are not obvious:

- **`TeamPrescriptionSheet` is a sibling of `PrescriptionSheet`, not a flag on
  it.** That one composes a new prescription from defaults; this one opens seeded
  with what is already prescribed, because an admin is adjusting somebody else's
  decision and needs to see it first. Defaulting to 3 × 10 here would quietly
  overwrite a considered 5 × 5.
- **A swap is two steps.** Remove, then add — not one compound call. Two
  deliberate steps write two honest activity rows ("Removed Barbell Squat",
  "Added Leg Press") where a swap would write one that hides half of what
  happened, and would have a partial-failure state leaving a plan with two
  exercises or none.
- **The screen keeps saying whose plan it is** — in the app bar, in a callout, and
  in the sheet. The audit trail is what makes the capability safe; telling the
  admin about it *in advance* is what makes the trail unsurprising rather than an
  ambush.

`ExercisePickSheet` reads the local `exercises` table, which already holds the
seeded library plus every team custom exercise (they ride sync). So the choice is
offline even though the write is not — separating them means the picker never sits
blank waiting on a request.

### 12.4 Verification

Backend: **123 tests**, `./mvnw -B verify` green. The 16 added ones pin that a
crossing is recorded and an own-edit is not, that a timed hold survives, that a
coach cannot edit and an outsider's plan 404s, that the edit reaches the owning
coach's phone and *not* the admin's, that the seeded library is untouchable, and —
asserted rather than reviewed — that the revenue response contains no client name
or id.

App: `npm run typecheck` clean, Android bundle exports (2,008 modules).

### 12.5 What is left

**Seats wired to billing.** The `seat_limit` column, the accept-time check and the
owner's editor all exist; what does not exist is a billing system to make a seat
cost anything. That is not a team-coaching gap.

**Everything else in this document is built.**
