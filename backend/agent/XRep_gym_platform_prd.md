# XRep — Gym Platform PRD

**Status:** design, nothing built. Written 23 Aug 2026.
**Ring:** 2 of the growth roadmap ("The gym — sell the ops/membership layer *warm*").
**Depends on:** V26–V27 team coaching, and the identity model V18 established.
**Reverses:** one locked decision — "one phone = one role" (V18, 15 Aug 2026).

XRep today is a trainer's product. This document is how it becomes a gym's
product **without stopping being a trainer's product**, because the trainer is
who we already have and the gym is sold to us *through* them.

The roadmap's Stage 3 is explicit about the motion: where several trainers in one
gym already use XRep, sell the owner the layer above them — a warm sale into a
gym that is already adopting us bottom-up. That direction of travel decides
almost every question below. **We are not building a gym product that happens to
contain trainers. We are building a trainer product that a gym can be given a
window into.**

### The two states, and the trainer keeps the first one forever

Everything in this document hangs off one distinction, so it goes before the
principles rather than inside them.

**State A — the gym is not on XRep.** A trainer works at FitZone; FitZone has
never heard of us. The trainer manages the entire commercial arrangement
themselves: they transcribe the gym's price list, they decide per client who
takes the cash, they apply the split, and they reckon up what they owe the gym at
month end. This is not a waiting room and it is not legacy. **It is what the
product already does, it is the majority path, and most gyms will never sign** —
the roadmap's gym sale is warm and comes later. Every existing mechanism serves
it and none of them is being deprecated:

| The fact | Where it lives in State A |
| --- | --- |
| Which gym I work at | `trainer.gym_name` — free text, and that is *correct* here; there is no gym row to point at |
| What the gym keeps | `trainer.gym_share_percent`, overridden per client by `client.trainer_split_percent` |
| Who takes the money | `client.payment_mode` = `trainer_collects` \| `gym_collects` |
| What I owe the gym this month | `gym_settlement` — **the trainer's own reckoning**, computed on their phone |
| The gym's price list | `pack.owner = 'gym'` — the trainer's transcription of prices they cannot discount |

**State B — the gym admin invites the trainer into a gym org.** From acceptance,
everything about that gym's clients is under the gym's control: the gym owns the
price list, the gym collects, the gym computes the share, the gym pays the trainer
out. The trainer stops authoring those facts and starts reading them.

**What crosses over is authorship, not ownership.** This is the sentence to hold
on to, because ownership is the thing §0.1 promises never moves:

| | State A | State B, gym client |
| --- | --- | --- |
| The plan, sessions, sets, body metrics, adherence | trainer | **trainer — unchanged** |
| The price | trainer | gym |
| Who collects | trainer's choice | gym, always |
| The payment row | trainer writes it | gym writes it, trainer reads it |
| The share percentage | trainer's own columns | gym's, pushed down |
| The month-end settlement | `gym_settlement` (trainer → gym) | `trainer_payout` (gym → trainer) |
| `client.trainer_id` | the trainer | **the trainer — unchanged** |

The coaching half never changes hands. Only the commercial half does.

And a trainer in State B still has State A alongside it: their own clients,
outside gym hours, entirely self-managed. The same person holds both at once,
which is why none of this can be a property of the *trainer* — it is a property
of the **client** (§0.2).

---

## Part 0 — The governing principles

Five. The first is inherited, the next three are new, and the fifth is the one
that will be tested by every feature request the gym owner makes.

### 0.1 A gym is a visibility grant, never a change of owner

The same sentence V26 opens with, one rung up. `trainer_id` keeps meaning what it
has always meant: the coach whose book this row is in. A gym does not own a
client, a program, a session or a rupee. What a gym gets is a **resolver** —
for a caller who is gym staff, the set of rows they may read widens from `{}` to
`{the clients this gym assigned}`.

Which is why **no existing table gains a `gym_id` that changes its ownership**.
One new nullable column, `client.gym_id`, says *which gym introduced this client*
— and that is a fact about provenance and visibility, not about who the row
belongs to. `client.trainer_id` is untouched and stays `NOT NULL`.

The alternative — the gym owns gym clients, the trainer owns the rest — was
considered and rejected. It puts two ownership models in one schema, and every
one of the 18 tables that filters on `trainer_id` would have to learn which axis
applies to the row in front of it. The grant model needs none of them to change.

### 0.2 The gym's window is drawn by `client.gym_id`, not by data type

The wall is **whose client**, not **what kind of data**. Inside the window the
gym sees everything, money included. Outside it the gym sees nothing at all —
not a client, not a count, not an aggregate.

For a gym client that is not a concession, it is arithmetic: **the gym is the
collector of record.** The client pays the gym, the gym keeps its share, and the
gym pays the trainer theirs at month end. There is no financial fact about that
client the gym does not already know, because the gym is the counterparty. Hiding
the package amount from the party that banked it would be theatre.

What the wall protects is therefore not session counts or pack balances. It is
**the trainer's independent income** — and that is a far stronger secret than
anything in the earlier framing. A gym learning that its 6am coach earns more
from four private clients than from the gym's twelve is exactly the fact that
gets a trainer's hours cut.

**`gym_id IS NULL` does not mean "independent".** It means **trainer-managed** —
and that covers two different people: a genuinely private client, *and* a State-A
gym client whose gym is not on XRep. Both are the trainer's to run, both are
invisible to any gym org, and the distinction between them lives where it always
has, in `client.payment_mode`. Getting this wrong in a query would hand a gym
org visibility of clients belonging to a *different* gym that never signed up.

| | Gym-org client (`gym_id` set) | Trainer-managed (`gym_id` NULL) |
| --- | --- | --- |
| Sessions, adherence, no-shows | gym sees | gym sees nothing |
| Package amount, discounts, what is outstanding | gym sees | gym sees nothing |
| Payments and receipts | gym sees | gym sees nothing |
| The trainer's share | gym computes it | gym sees nothing |
| That the client exists at all | gym sees | **gym cannot count them** |

**This does not weaken V26 §0.4, and the distinction is worth being precise
about.** A *team* is trainers sharing visibility of each other's books, and there
money stays private because a coach's earnings are nobody's business but theirs —
the owner gets totals only. A *gym* is the counterparty to the transaction, not a
peer looking sideways. Same phrase, "visibility grant"; different relationship,
so a different money answer. `package`, `payment` and `gym_settlement` remain
closed under every `/v1/team/**` path, unchanged.

### 0.3 For a gym client the gym collects; the trainer is paid a share

The commercial model, stated once because every table below depends on it:

```
gym collects the full package amount from the client
month end:  trainer_share  →  paid out to the trainer
            gym_share      =  Σ packages − Σ trainer shares
```

Money flows **gym → trainer**. That is the opposite direction from the one table
we already have. V11's `gym_settlement` is money going *out* from the trainer —
"the gym's cut for a month, and whether it has been handed over" — which is the
right model for the *other* case: a trainer who takes cash on the floor from a
gym member and owes the gym its percentage.

Both directions are real and a trainer at a gym will have both in the same month:

| Case | Who holds the cash | The obligation | Table |
| --- | --- | --- | --- |
| `payment_mode = 'gym_collects'` | the gym | gym owes the trainer their share | **`trainer_payout`**, new (§3.4) |
| `payment_mode = 'trainer_collects'` | the trainer | trainer owes the gym its cut | `gym_settlement`, exists |

`gym_settlement` is **not** extended with a direction flag. Its `amount` means
"what I owe the gym" and `settled_at` means "when I handed it over"; a direction
column would leave both columns meaning two different things depending on a
sibling value, which is the quiet repurposing the schema law exists to prevent.
A payout is a different obligation between different parties and gets its own
table — the same argument V11 itself made when it refused to put a `direction`
flag on `payment`.

**Two columns must be frozen at record time.** The gym is reachable today only
through `client.gym_id`, which is *current* state. If a client leaves the gym, or
the trainer changes gyms, every historical payment silently re-attributes — or
attributes to nothing. So `payment` and `package` each gain a nullable `gym_id`
stamped when the row is written. This is not a new idea; it is exactly why V11
froze `share_percent` onto the payment row rather than looking it up later, and
why `gym_settlement.gym_name` is denormalised so "the September row must keep
saying which gym it was owed to".

**Gym-authored rows are pull-only on the phone — one rule, not three special
cases.** Once a client is under gym management, the commercial rows about them are
written by the gym console and only read by the app. The sync push refuses any
row it is handed whose `gym_id` is set, per record, with a
`GYM_MANAGED_READ_ONLY` rejection — the same shape as `TEAM_READ_ONLY`, and
refused out loud for the same reason: a record that sits on a phone looking
synced and exists nowhere else is the worst of the three options. That covers
`payment`, `package` and `pack` in one rule rather than three guards somebody has
to remember to add.

**Gym-collected payments are server-authored.** Today the app freezes
`gym_share_amount` and `share_percent` onto the row at record time, on the phone.
When the gym is the collector, the gym console writes the row and the trainer
*pulls* it — so `payment` acquires a second writer, and the sync push must refuse
a phone's edit to a gym-collected row with a `GYM_COLLECTED_READ_ONLY` rejection,
the same shape and for the same reason as `TEAM_READ_ONLY`. A trainer cannot
amend a receipt the gym issued.

The trainer still sees all of it. Their money book stays whole — they need the
gross to check that the share they were paid is right, and a trainer who cannot
audit their own payout will not trust the gym tier.

**Decided: the trainer is paid on what was COLLECTED, not on what was sold.**
A client who has paid ₹6,000 of a ₹12,000 pack produces a share of ₹6,000 this
month; the balance is chased (§3.5) and pays out when it arrives. Three
consequences follow, and the third is the one that would have been a bug:

1. **The payout is computed from payments, not from packages.** A payment in
   September against an August package belongs to September's payout. `period`
   on `trainer_payout` is therefore the *payment's* month, never the package's.
2. **Write-offs become correct for free.** `package.written_off_amount` was never
   collected, so it never enters a payout and the trainer's share of a bad debt
   is automatically nil. On a sold basis we would have had to subtract it back
   out, and the row that did so would be the one nobody could explain. This is
   an argument for the collected basis over and above the commercial preference.
3. **Every payment must record which payout consumed it** — `payment.payout_id`,
   nullable FK. Without it, a payment recorded late (backdated `paid_at` after
   the month was closed) is either silently dropped or paid twice, and neither
   failure is visible. With it, a late payment simply has `payout_id IS NULL` and
   is swept into the next run, which is the behaviour you would ask for anyway.
   It is the same instinct as `scheduled_session.pack_package_id`: remember
   exactly what was applied, because recomputing it later guesses.

### 0.4 A person is not a role

V18 made `app_user.role` a single exclusive value and it was the right call for
what V18 knew. It is wrong for this, and the reason is not the gym — it is that
the assumption was never true of the people we already serve:

- Ravi coaches at FitZone in the morning and trains four private clients in the
  evening. One person, two working contexts, one of which the gym may see.
- Priya is the gym's admin *and* one of its trainers. Today she has to pick.
- Suresh is a trainer, and he is also a paying client of another trainer. This
  used to be refused outright (`PHONE_IS_TRAINER`); **as of 23 Aug 2026 it is
  allowed** — see the status note after §1.3 below. Ravi's and Priya's cases
  (a person scoped to a gym) are not: those still need Part 1's `user_role`.

The model becomes: **identity is single, roles are many, and every role is scoped
to a context.** One `app_user` per phone — V18's best idea and it stays — plus
`user_role` rows, each carrying *what* you are and *where* you are it (§1.1).

Note the honest cost. V18's complaint about the design it replaced was real: a
single role column is one lookup that can pick a screen, and a role *set* cannot.
So this is not a return to the pre-V18 design. It is a third design in which the
app **opens in a declared default role** and offers a switcher — which is more
work than either of the first two, and is the correct amount of work.

### 0.5 Independent work is invisible to the gym by construction, not by filter

The most important implementation constraint in this document.

A trainer's trainer-managed clients — private clients *and* the clients of any
gym that is not on XRep — must be unreachable from a gym-staff token, and
"unreachable" has to mean *the scope resolver never returns them*, not *every
query remembers to add `AND gym_id IS NOT NULL`*. A filter that must be
remembered in 40 places will be forgotten in one, and the one will be the revenue
screen.

So the gym scope resolves to a **set of client ids** (`client.gym_id = :gymId`),
not to a set of trainer ids the way `TeamScope` does. That difference is the
entire safety property. A team widens *whose books* you read; a gym widens
*which clients* you read, and the trainer's other clients are not in the set
because the set was built from the gym.

This also makes §0.2's "no aggregate either" enforceable: you cannot accidentally
count rows you cannot select.

---

## Part 1 — Identity and roles

### 1.1 `user_role` — what you are, and where

```sql
CREATE TABLE user_role (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    app_user_id   UUID        NOT NULL REFERENCES app_user(id),

    -- 'trainer' | 'client' | 'gym_admin' | 'gym_staff'
    role          VARCHAR(20) NOT NULL,

    -- 'self' | 'gym' | 'trainer'  — the kind of thing this role is held in
    scope_type    VARCHAR(20) NOT NULL,
    -- the gym id, or the trainer whose roster you are on. NULL for 'self'.
    scope_id      UUID,

    -- 'active' | 'invited' | 'ended'
    status        VARCHAR(20) NOT NULL,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
```

The `(role, scope)` pair is the point, and a flat list of roles would not do.
"Trainer" is not a global fact about Ravi — he is a trainer *at FitZone*, a
trainer *on his own account*, and a client *of Suresh*. A flat list cannot say
which gym he administers, and the gym-admin case is unrepresentable without it.

**`app_user.role` is not dropped and not repurposed.** It is re-read as *the role
the app opens in* — the home role — which is a narrowing of meaning that every
existing reader survives, because for everyone who exists today it is also their
only role. New authorization decisions read `user_role`. This is the same move V8
made with `setup_completed_at`: state the fact rather than deduce it, and leave
the old column saying the smaller true thing.

Backfill is exact and needs no guesswork: one `active` row per `app_user`,
mirroring `app_user.role`, `scope_type = 'self'` for a trainer and
`scope_type = 'trainer'` with the roster's trainer id for a client.

### 1.2 `trainer.app_user_id` — link the person to the profile

Today `trainer` and `app_user` are joined by **phone**, and `client.phone` is a
third copy. Phone numbers change; `team_member` already keeps `invited_phone`
around precisely because a number on a trainer row can be edited afterwards. Add
a nullable FK and stop matching on a mutable string.

**`trainer.id` remains the ownership key and the trainer principal.** Do not
promote `app_user.id` into that role — 25 foreign-key columns across 21 tables
and every ownership filter in the product depend on `trainer_id`. The person and
the professional profile are different objects and both are needed.

### 1.3 What actually breaks — the real cost of Part 1

None of the above is expensive. This is:

| Site | Today | Becomes |
| --- | --- | --- |
| **The JWT** | subject = trainer UUID for trainers, **phone** for every other role | subject = person, plus the **active role and scope** as claims |
| `SecurityConfig` | path rules keyed on `ROLE_TRAINER` / `ROLE_CLIENT` / `ROLE_INVITED`, first match wins | the same rules, but the granted authority comes from the token's active role, not from the one row `app_user` holds |
| Subject resolution | `UUID.fromString(subject)` off `SecurityContextHolder` — 16 files, 34 call sites: 13 controllers plus `JwtAuthFilter` and `RateLimitFilter` | resolve the trainer id for the *active* role; **fail closed** if the active role is not a trainer role |
| `RateLimitFilter` | keys buckets on the token subject | must key on person + active role, or a trainer switching roles shares one bucket with themselves |
| `AuthService` | returns one role and picks a screen from it | returns the role **set** plus the default, and the screen decision moves after the pick |
| `ClientPhoneGuard` | refuses a trainer's number (`PHONE_IS_TRAINER`) | narrows to the only case that stays illegal — *your own* number on *your own* roster (self-training is a separate switched-off feature) |
| `RoleScreen` (5a) | survives only for a client on two rosters; the coaching card "went with it" in V18 | the coaching card comes back, and the screen becomes the general role picker it was originally |

`PHONE_IS_TRAINER` stays in the error catalogue and in `API.md` per the schema
law. It stops firing for the cross-person case and keeps firing for the self
case, which means no app build has to change to keep working.

**Status, 23 Aug 2026 — the trainer↔client slice of this shipped, and cheaper
than the table above.** Suresh's case (§0.4) is live: `ClientPhoneGuard`
narrows exactly as the table says, `TeamPhoneGuard` drops its mirror rule, and
`AuthService#trainerView` surfaces a trainer's own live client memberships in
`clientOf` for the app's picker to use. But it did **not** need the JWT,
`SecurityConfig`, `RateLimitFilter`, or subject-resolution rows in the table
above — those describe a single token whose *active role and scope* are
claims inside it, which only earns its cost once there is a role set wider
than {trainer, client} to represent (gym-admin, gym-staff — Part 2). For just
this pair, `app_user.role` narrowing to a *home* role plus two small
endpoints, `POST /v1/auth/mode/trainer` and `POST /v1/auth/mode/client`, was
enough: each mints a fresh, ordinary token of the *other* kind — a trainer
token (subject = trainer UUID) or a client token (subject = phone) — exactly
as `POST /v1/auth/otp/verify` always has, rather than one token type learning
to carry a mutable active-role claim. No new `user_role` table either — "which
modes can this phone enter" is derived on the fly from `trainer` and `client`
by phone, the same query shape `AuthService` already used for a pure client's
`clientOf`.

So: `AuthService` did change (`trainerView` now looks at the client rows the
join already returned), and `RoleScreen`/its app-side lens mechanism is what
the switch reuses — but "returns the role **set** plus the default" as a
redesign of `AuthService`'s return shape did not happen, and neither did
anything in the JWT/SecurityConfig/RateLimitFilter/subject-resolution rows.
Those four remain exactly the open cost Part 1 describes, still gating
gym-admin and any other scope-bearing role — `user_role` (§1.1) and
`trainer.app_user_id` (§1.2) are both still to build.

**Sequencing note.** Part 1 is worth doing before more data accumulates, and the
reason is narrow but real: a refused write leaves nothing to migrate. Every
trainer who wanted to be somebody's client between now and Ring 2 is a
relationship that was never recorded and cannot be recovered. Everything else in
this document is additive and can wait for the gym.

---

## Part 2 — The gym model

### 2.1 Three new tables

```sql
CREATE TABLE gym (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The account holder. An app_user, NOT a trainer: the owner of a gym is
    -- frequently not a coach, and modelling them as one would force a trainer
    -- profile nobody uses onto every gym we sign.
    owner_app_user_id  UUID         NOT NULL REFERENCES app_user(id),
    name               VARCHAR(120) NOT NULL,
    city               VARCHAR(80),
    metadata           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE TABLE gym_branch (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id      UUID         NOT NULL REFERENCES gym(id),
    name        VARCHAR(120) NOT NULL,
    address     TEXT,
    -- …timestamps, deleted_at
);

CREATE TABLE gym_staff (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id        UUID        NOT NULL REFERENCES gym(id),
    branch_id     UUID        REFERENCES gym_branch(id),
    -- app_user, not trainer: front desk, the manager and the accountant are
    -- staff and are not coaches. This is the single reason gym staff cannot be
    -- modelled as `team_member`, whose trainer binding assumes a coach.
    app_user_id   UUID        REFERENCES app_user(id),
    invited_phone VARCHAR(15),
    -- 'owner' | 'admin' | 'manager' | 'front_desk' | 'trainer'
    role          VARCHAR(20) NOT NULL,
    status        VARCHAR(20) NOT NULL,
    -- …invited_at / joined_at / …, timestamps, deleted_at
    CONSTRAINT gym_staff_identifies_somebody
        CHECK (app_user_id IS NOT NULL OR invited_phone IS NOT NULL)
);
```

`gym_branch` exists from day one because the roadmap's gym suite says
"multi-branch dashboard" and a branch retrofitted later is a nullable column on
every gym-owned table plus a back-fill that has to guess. It costs one table now.

`gym_staff` deliberately mirrors `team_member`'s shape — nullable member id,
kept `invited_phone`, four status timestamps, a CHECK that the row identifies
somebody — because the invite-before-account flow is the same acquisition
channel and was already argued in V26. Copy the shape, keep the reasoning.

### 2.2 `client.gym_id` — one nullable column, three answers

```sql
ALTER TABLE client ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES gym(id);
```

`NULL` means the trainer's own client. Not null means the gym introduced them.
That single column answers three questions that would otherwise each need their
own mechanism:

1. **Can the gym see this client?** Yes iff `gym_id` matches the caller's gym.
   This is the set §0.5 builds the scope from.
2. **Does the gym take a cut?** The existing `payment_mode` and
   `trainer_split_percent` still decide *how much*; `gym_id` decides *whose*.
3. **Who keeps the client if the trainer leaves the gym?** The gym does, for
   `gym_id` rows — reassigned to another coach through the existing
   `client_assignment` machinery. Trainer-managed clients leave with the trainer,
   untouched, because the gym was never in their scope.

Also add nullable `gym_id` to `pack` and `gym_settlement`. Both already carry the
gym as **free text** (`pack.owner = 'gym'` names no gym at all;
`gym_settlement.gym_name` is a denormalised string, deliberately so, and stays as
the historical record). `trainer.gym_name` likewise stays and becomes the display
fallback for a trainer with no `gym_staff` row.

### 2.3 A gym member is not a `client`

The gym has 800 members. Sixty of them buy personal training. The other 740
cannot be `client` rows, because `client.trainer_id` is `NOT NULL` — and making
it nullable is forbidden by the schema law *and* would break the ownership filter
on every one of the ten tables that hang off `client.id`.

So:

- **`gym_member`** is the gym's roster: `(gym_id, branch_id, app_user_id,
  invited_phone, member_no, status, joined_at, …)`. Owned by the gym.
- Assigning a member to a trainer for PT **creates a `client` row owned by that
  trainer**, with `gym_id` set and a nullable `gym_member_id` pointing back.
- Ending the PT engagement does not end the gym membership. Two lifecycles, two
  rows, one person.

This is §0.1 doing real work: the assignment does not move ownership, it *creates
ownership* in the trainer and records the provenance.

`client.membership_status` still governs consent, and V26 §4.4's existing call
holds: a client who accepted coaching *from the gym* is not re-invited because the
gym changed who delivers it.

### 2.4 One gym plus independent work, and why `team` survives untouched

The confirmed scope is: a trainer works under **one** gym and takes independent
clients outside those hours. Two gyms at once is out of scope for now.

The happy consequence: because gym membership is a `gym_staff` row and **not** a
`team_member` row, `uq_team_member_active_trainer` — the partial unique index that
enforces one team per trainer — **needs no change**. A trainer can be a coach in a
gym and lead their own team of independent coaches at the same time, and the two
constraints never meet. V26's three arguments for that index (whose library, which
admins read your clients, whose seat) all still have single answers.

Keep grants as **rows** rather than a `trainer.gym_id` column anyway. The column
would be cheaper today and would have to be abandoned the first time a freelance
trainer takes shifts at two gyms, which the market will eventually ask for.

`team` stays what it is: the independent senior-trainer construct. A gym does not
get `team` rows — its sub-units are branches. If gym admins are later given the
V27 power to edit a teammate's plan, that needs its own append-only
`gym_activity` table with `gym_id NOT NULL`, exactly parallel to `team_activity`.
Duplicating that small table is far cheaper than making `team_activity.team_id`
nullable, which the law forbids in any case.

### 2.5 State A → State B: the claim, and what it must never sweep

The transition is the riskiest moment in the whole feature, because on one side of
it a trainer's money is theirs to record and on the other it is a gym's to record.
It gets two separate consents and no automatic behaviour.

**Consent one — the trainer joins the org.** A `gym_staff` invite, accepted by
the trainer. This alone changes **nothing** about any client. A trainer can be on
a gym's staff list and still manage every one of their clients themselves, which
is exactly the state a cautious trainer will want to sit in for a month.

**Consent two — the trainer nominates which clients are the gym's.** Per client,
by the trainer, from their own roster. Writing `client.gym_id` is what hands over
authorship, and only the trainer can initiate it.

**It must not be a sweep, and the reason is not squeamishness.** The obvious
shortcut is to claim everything with `payment_mode = 'gym_collects'`, or match on
`trainer.gym_name`. Both are wrong:

- `gym_name` is free text typed by each trainer independently. "FitZone",
  "Fit Zone", "fitzone anna nagar" — forty trainers, forty spellings, and the
  gym next door is called FitZone too. Matching on it is guessing, and a wrong
  guess hands one gym a window into another gym's clients.
- `payment_mode = 'gym_collects'` is true of clients at gyms that will never sign
  up. A trainer with clients at two gyms — one on XRep, one not — would have the
  second gym's clients claimed by the first.

Because the trainer points at their own rows, no string matching is needed
anywhere, and the unjoinable-`gym_name` problem simply never has to be solved.

**What crosses, and what does not:**

| | On claim |
| --- | --- |
| `client.gym_id` | set — this is the whole operation |
| `client.trainer_id` | **untouched.** §0.1. |
| The plan, sessions, workouts, body metrics | untouched, and stay the trainer's to write |
| Future packages and payments | authored by the gym from here on |
| **Past** packages and payments | **stay exactly as they are, trainer-authored, and stay in the trainer's book.** The gym did not collect that money and has no claim on the record of it. `payment.gym_id` is stamped at write time, so historical rows simply have NULL and are never attributed to the gym. |
| `gym_settlement` history | stays the trainer's. It is the record of what they owed a gym that was not in the system, and it is finished business. |
| Transcribed `pack.owner = 'gym'` rows | **retired, not deleted** — `status = 'inactive'`. Packages were sold from them and those packages must keep resolving. The gym's own `pack` rows supersede them for new sales. |
| `nudge_rule` | untouched — it has no `client_id`. The `overdue` rule is suppressed per client at evaluation time (§3.5), not deleted. |

**The claim is audited, because a payout will be disputed.** One append-only row
per transition — who claimed which client into which gym, when, and at whose
confirmation. Without it, the first argument about a payout has no answer to "was
this client under gym management in September or not", and that answer is the
difference between two figures.

```sql
CREATE TABLE client_management_change (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        UUID         NOT NULL REFERENCES client(id),
    -- NULL on the way out: management returning to the trainer.
    gym_id           UUID         REFERENCES gym(id),
    -- 'trainer' | 'gym' — who authors the commercial facts from this moment.
    to_manager       VARCHAR(20)  NOT NULL,
    trainer_id       UUID         NOT NULL REFERENCES trainer(id),
    actor_app_user_id UUID        NOT NULL REFERENCES app_user(id),
    note             VARCHAR(500),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    -- append-only: no updated_at, no deleted_at. A claim made in error is
    -- undone by making the opposite change, which writes another row.
);
```

**Leaving.** A trainer who leaves the gym org keeps their trainer-managed clients
untouched and does **not** take the gym's clients with them — those were decided
to stay with the gym and get reassigned to another coach (§2.2). If the gym org is
deleted outright, its clients revert to trainer-managed: `client.gym_id` back to
NULL, a second `client_management_change` row, and the trainer is in State A again
with their history intact. That reversibility is what makes the claim safe to
offer.

---

## Part 3 — What the gym actually gets (Phase 1)

All of it under `/v1/gym/**`, resolved by `GymScope` (a client-id set, §0.5),
authorised by `gym_staff.role`. `STANDARD` rate-limit tier except where noted.

### 3.1 The assignment flow

The gym admin's core loop, and the thing being sold:

1. Admin adds or picks a `gym_member`.
2. Admin assigns them to a trainer on staff → creates the `client` row
   (`trainer_id` = that trainer, `gym_id` = this gym, `membership_status =
   'invited'`), and pushes to the trainer.
3. The member accepts on their own phone, exactly as today.
4. The trainer sees a new client in their roster, indistinguishable from one they
   added themselves except for a "from FitZone" tag.

Reassignment between staff trainers reuses `client_assignment` verbatim,
including the tombstone logic of V26 §5.2 — which is already correct for this
case, because the rows really do move off the old coach's phone.

### 3.2 The delivery and revenue dashboard

Per assigned client: sessions kept / planned this month, last session date,
no-show count, pack sessions remaining, the package amount and what is
outstanding, and the assignment history. Aggregated per trainer and per branch
for the owner.

Every number here is derivable from `scheduled_session`, `package` and `payment`
restricted to `GymScope`. **No new stored aggregate** — the same rule the app
already follows for adherence and personal records, and for the same reason: a
stored figure is a second copy of the truth and second copies drift.

The one exception is `trainer_payout` (§3.4), which *is* stored — for the same
reason `weekly_report` is stored rather than derived: it was acted on. A payout
that silently re-computes after the trainer was paid is not a payout, it is an
argument.

### 3.3 `trainer_feedback` — and who is allowed to read it verbatim

```sql
CREATE TABLE trainer_feedback (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id             UUID        NOT NULL REFERENCES gym(id),
    client_id          UUID        NOT NULL REFERENCES client(id),
    trainer_id         UUID        NOT NULL REFERENCES trainer(id),
    requested_by       UUID        REFERENCES app_user(id),
    rating             SMALLINT,
    comment            TEXT,
    requested_at       TIMESTAMPTZ,
    submitted_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- append-only: no updated_at, no deleted_at
);
```

One design decision worth stating rather than discovering: **the gym reads
verbatim comments; the trainer reads only the aggregate.** If a coach can read
what a member wrote about them by name, no member writes anything true, and the
feature is worse than not having it. The trainer sees their rolling average and
the count; the gym sees the text.

That asymmetry is the opposite of §0.2's general direction (the trainer usually
sees more than the gym), so it needs saying in the copy on both sides — the
member is told the gym will read it, and the trainer is told they will not see
names.

### 3.4 `trainer_payout` — the month-end settlement, gym → trainer

```sql
CREATE TABLE trainer_payout (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id           UUID          NOT NULL REFERENCES gym(id),
    trainer_id       UUID          NOT NULL REFERENCES trainer(id),
    branch_id        UUID          REFERENCES gym_branch(id),

    -- 'YYYY-MM'. Same unit as gym_settlement, for the same reason: a month is
    -- what every gym in India settles on.
    period           VARCHAR(7)    NOT NULL,

    -- `gross_collected` is what the share is computed from (§0.3, decided).
    -- `gross_sold` is stored anyway because it is the number the trainer will
    -- ask about — "the pack was 12,000, why is my share on 6,000" — and the row
    -- should answer that without a join.
    gross_sold       NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_collected  NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- 'collected' | 'sold'. Defaulted rather than assumed: a larger gym may
    -- later pay its coaches on billing, and that must be a config change per
    -- gym and not a migration.
    basis            VARCHAR(20)   NOT NULL DEFAULT 'collected',

    trainer_share    NUMERIC(12,2) NOT NULL,
    gym_share        NUMERIC(12,2) NOT NULL,

    -- What it was worked out from, so the row can be argued with — the same
    -- courtesy gym_settlement.sessions_counted extends.
    sessions_counted INTEGER,
    package_count    INTEGER,

    -- 'due' | 'paid'
    status           VARCHAR(20)   NOT NULL DEFAULT 'due',
    paid_at          TIMESTAMPTZ,
    note             VARCHAR(500),

    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_trainer_payout_period
    ON trainer_payout (gym_id, trainer_id, period) WHERE deleted_at IS NULL;

-- Which payout consumed this payment. NULL = not yet paid out, which is also
-- how a late-recorded payment finds its way into the next run (§0.3).
ALTER TABLE payment ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES trainer_payout(id);
CREATE INDEX idx_payment_payout ON payment (payout_id) WHERE payout_id IS NOT NULL;
```

`period` is the month the *money arrived*, not the month the pack was sold. A
payout is closed by stamping `payout_id` on the payments it consumed, so the
figure and its evidence can never drift apart: the trainer taps the payout and
sees the fourteen receipts that made it.

Written by the gym, **read by both sides**. The trainer must be able to open the
row that produced their payment and see the gross it was computed from — a coach
who cannot audit their own payout will not trust the gym tier, and "trust the
number" is the entire product here.

`gym_share` is stored rather than derived even though it is
`gross − trainer_share`, because the arithmetic is only that simple when nothing
else happened. A refund, a written-off package or a mid-month rate change all
break the identity, and the row has to keep saying what was actually settled.

### 3.5 Chasing the balance — and who is allowed to

A collected basis makes the unpaid balance somebody's job, and it is **the gym's**,
not the trainer's. The gym issued the receipt, holds the money and carries the
receivable. A trainer chasing a debt they do not hold — for a client who paid the
counter — is the single fastest way to make the gym tier feel like a demotion.

So for a client where `gym_id IS NOT NULL` **and**
`payment_mode = 'gym_collects'`, the trainer's own `overdue` nudge rule is
**suppressed**, and the gym console gets the chase instead. The trainer still
*sees* the outstanding balance, because their share depends on it (§0.2) — they
simply are not the one asking for it.

**The gym's reminder is a `nudge_log` row, not a new table**, and the reason is
the frequency cap. The rule engine runs on the phone
(`app/src/nudges/rules.ts`), `COOLDOWN_DAYS = 7`, and the "once per client per
seven days" limit is computed device-side from that client's `nudge_log` history.
A gym reminder stored anywhere else is invisible to that check, and the client
gets two WhatsApp messages in one afternoon — from a product whose own rule
editor says out loud that some limits protect the trainer from themselves.

`nudge_log` therefore gains two nullable columns:

```sql
ALTER TABLE nudge_log
    ADD COLUMN IF NOT EXISTS gym_id              UUID REFERENCES gym(id),
    -- Who pressed send. NULL reads as "the trainer", which is what every row
    -- written before this migration was.
    ADD COLUMN IF NOT EXISTS sent_by_app_user_id UUID REFERENCES app_user(id);
```

`nudge_log.trainer_id` stays `NOT NULL` and keeps its meaning — the client always
has a coach, and the row is still in that coach's book. What is new is that the
coach was not necessarily the sender. Gym-sent rows sync to the phone like any
other `nudge_log` row, which is precisely what makes the cooldown hold across
both senders without the device knowing anything about gyms.

The gym's chase endpoint sits in the **`MESSAGING` tier (10/min)** like every
other path that spends a real WhatsApp message.

---

## Part 4 — The ops suite (Phases 2–4, deferred)

The confirmed scope is the full roadmap suite. All of it is **new tables with a
`gym_id`**, and none of it touches an existing table. That is not luck; it falls
out of §0.1.

| Area | New tables | Note |
| --- | --- | --- |
| Memberships | `gym_plan`, `gym_membership`, `gym_membership_payment` | The gym's own money book. **Not** rows in `payment` — `payment.client_id` and `payment.trainer_id` are both `NOT NULL`, which makes that table a trainer↔client artefact by construction. This is exactly the argument V11 already made for giving `gym_settlement` its own table instead of a `direction` flag, and it holds unchanged here. |
| Attendance | `check_in` | QR or front-desk. High row volume — partition or prune from day one; this is the one table that will outgrow the others by an order of magnitude. |
| Classes | `gym_class`, `class_schedule`, `class_booking` | A class *is* a timetable somebody signs up to, which is precisely what V15 said a `batch` is **not**. Do not merge them. A batch stays the trainer's four-people-at-six; a class is the gym's Zumba slot with 30 bookings. |
| Leads | `gym_lead`, `lead_activity` | Trial visits, follow-ups, conversion to `gym_member`. |
| Money out | `gym_expense`, `staff_payroll`, `payroll_line` | Payroll touches `gym_staff`, never `trainer`. A trainer's earnings from their own clients are not the gym's to compute. |
| Multi-branch | (none new) | Every table above carries `branch_id`; the rollup is a query. |

Two rules for all of Phase 2+:

- **The two money books join on gym clients, and only there.** For a
  `gym_id` client the gym is the collector and both sides see the same figures
  (§0.2). For a trainer-managed client the gym has no reach at all. `client.gym_id`
  is the join key and the wall, and it is the same column doing both jobs —
  which is why it must never be widened into "the gym can see the trainer's
  totals".
- **Gym membership fees are not PT money.** `gym_membership_payment` is a
  member paying the gym for access; `payment` is a client paying for coaching.
  They never sum into one figure, because a trainer's share is computed only
  from the second.
- **`check_in` is not adherence.** A member scanning in at the door says nothing
  about whether their PT session happened. Resist the join; it will be requested.

---

## Part 5 — Migration sequence

Every step additive. No `ALTER` that drops, renames or retypes; no index dropped.

> **Read every number below one higher.** V28 was taken on 27 Aug 2026 by
> `attention_dismissal` — the table behind Today's silenceable action queue
> (`backend/API.md` § *Attention dismissals*). A shipped migration claims its
> number and a design document renumbers; this is recorded as one line rather than
> rewritten in place, so the six references in this section stay greppable against
> the sequence they were reasoned about in. So V28 → **V29**, V29 → **V30**,
> V30 → **V31**, V31+ → **V32+**.

| | Contents | Blocking? |
| --- | --- | --- |
| **V28** | `user_role`; `trainer.app_user_id`; backfill one `active` role row per `app_user` | **Do this first.** §1.3 — a refused write leaves nothing to migrate. |
| **V29** | `gym`, `gym_branch`, `gym_staff`; nullable `gym_id` on `client`, `pack`, `gym_settlement`, **`payment` and `package`** (frozen at record time, §0.3) | When the first gym signs. |
| **V30** | `gym_member` (+ `client.gym_member_id`); `trainer_feedback`; **`trainer_payout`** + `payment.payout_id`; `nudge_log.gym_id` and `nudge_log.sent_by_app_user_id`; **`client_management_change`** (§2.5) | With Phase 1. |
| **V31+** | The ops suite, one migration per area in Part 4 | Per phase. |

App-side (WatermelonDB) counterparts: `gym_id` on `clients`, `packs`, `packages`
and `payments` reach the phone — the roster tags a gym client, and the money
screen has to show the trainer which figures the gym collected. `trainer_payout`
reaches the phone too, pull-only: the trainer's own money screen is where they
audit it, and it must open with no signal. `payment.payout_id` and the two new
`nudge_log` columns must reach the phone as well — the first so the trainer can
see which payments have been settled, the second because the device-side cooldown
has to count a gym-sent reminder (§3.5). **`gym_member`,
`gym_staff`, `trainer_feedback` and everything in Part 4 stay online-only** —
same reasoning as V26's team tables: a permission change or a gym-owned record
authored on a phone with no signal is one replayed at an unknown later time. The
gym admin console is a **web app** (`web app/Design/webapp` is already being
designed), which is online by nature and sidesteps the question entirely.

---

## Part 6 — What does not change

Stated explicitly, because the list is the reassurance:

- **State A is untouched and is not deprecated.** A trainer whose gym is not on
  XRep keeps managing everything themselves — `trainer.gym_name` as free text,
  `gym_share_percent`, `client.payment_mode`, `client.trainer_split_percent`, the
  trainer-computed `gym_settlement`, and `pack.owner = 'gym'` as their own
  transcription. This is the majority path and every one of those mechanisms
  stays exactly as it is. Nothing in Part 4 may make it worse.
- `client.trainer_id` stays `NOT NULL`. The trainer owns their clients.
- No existing table gains an ownership column. `trainer_id` means what it meant.
- The trainer's default scope is unchanged — they open the app and see their own
  roster, gym and independent together, exactly as today (V26 §0.2).
- Offline scope is unchanged. Nothing gym-owned enters sync.
- The team feature is untouched, including `uq_team_member_active_trainer`
  (§2.4).
- `app_user.phone` stays `UNIQUE`; one identity per number was always right.
- No health or medical data, per the DPDP position. `trainer_feedback.comment` is
  free text about a service, and the copy must keep it that way.
- Soft deletes, client-generated UUIDs, `updated_at` cursors: all unchanged.

---

## Part 7 — Phases

**Phase 0 — multi-role identity.** V28, the JWT change, `RoleScreen`'s coaching
card back, `ClientPhoneGuard` narrowed. No gym anywhere. Ships value on its own:
a trainer can be somebody's client, which is a thing trainers have asked for.

**Phase 1 — the gym window.** V29–V30, `GymScope`, the staff invite, the
per-client claim (§2.5), the assignment flow, the delivery and revenue dashboard,
`trainer_payout`, `trainer_feedback`, and the web console. This is the warm sale:
the owner sees that the training they sold is being delivered, and settles with
their coaches from the same screen.

Note what Phase 1 does **not** do: it does not touch a single trainer who is not
in a gym org. State A ships unchanged, which means Phase 1 can be released to
everyone and is inert for almost all of them.

**Phase 2 — memberships.** The gym's own money book. This is what replaces the
gym's spreadsheet and is the real buying trigger.

**Phase 3 — attendance and classes.** Check-in, class booking.

**Phase 4 — leads, expenses, payroll, multi-branch.** The rest of the suite.

Phase 1 is what makes the gym a customer. Phase 2 is what makes them stay.

---

## Part 8 — Open questions

**8.1 — RESOLVED 23 Aug 2026. Paid on what was COLLECTED.** A part-paid package
pays the trainer a share of what arrived; the balance is chased by the gym (§3.5)
and pays out in the month it lands. See §0.3 for the three consequences —
payment-based periods, write-offs correct for free, and `payment.payout_id` as
the anti-double-pay stamp.

**8.1b — RESOLVED 23 Aug 2026. The gym's percentage is authoritative for
`gym_id` clients**, because the gym is the payer, and it is pushed down to the
trainer rather than each side computing its own. `trainer.gym_share_percent` and
`client.trainer_split_percent` stay authoritative for trainer-managed clients —
which includes every State-A gym client, where those two columns are the *only*
record of the arrangement and must keep working untouched.

The hazard this resolves is worth keeping on the record: those two columns express
the split from **opposite ends** — one is what the gym keeps, the other is the
trainer's split — and **neither is used in any server-side computation today**.
The app freezes the result onto `payment.share_percent` at record time, on the
phone. Two parties computing the same percentage from two columns of opposite
polarity is a disagreement about a payout waiting to happen, so exactly one side
computes it and the other is told.

**8.2 Who pays?** The roadmap calls the gym tier the biggest revenue lever and
says trainers get free access. Which means seats, billing, and a subscription
entity that does not exist — V26 §7 already parked "seats wired to billing, when
there is a billing system to wire them to". Same blocker, now bigger.

**8.3 What happens to a gym client when the trainer leaves and there is no
replacement?** `client_assignment` needs a `to_trainer_id`. A gym with one coach
who quits has clients with nowhere to go. Options: assign to the gym owner's own
trainer profile, or allow a `client` row to be parked — which would need a
nullable `trainer_id` and is therefore not available. Probably: the gym owner
must have a trainer profile, created implicitly.

**8.4 Can a gym admin edit a trainer's programs?** V27 gave team admins that
power with `team_activity` as the price. Gyms will ask. If yes, it needs
`gym_activity` (§2.4) and the same argument about the log being readable by the
coach, which is what made the capability acceptable.

**8.5 Does the member get the client app, or a gym app?** Ring 3 is "gym members
+ self-directed users". A member with no PT has no trainer, no plan and no
sessions — the current client app would be empty for them. Out of scope here,
but it is the next question after Phase 2 and it decides whether `gym_member`
ever needs its own client-facing sync scope.
