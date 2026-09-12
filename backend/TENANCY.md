# Tenancy — how a row knows whose it is

**Status: BUILT, and ON in development.** V37–V42, 30 Aug 2026. 251 tests green,
including eleven that run as `inclineyou_app` and prove the walls hold. Companion to
`SCHEMA.md` and `API.md`; this file carries the *why*, they carry the reference.

A root `tenant` table, a `tenant_id` on every table, and Postgres row-level
security as the wall — with **one person belonging to several tenants at once**.
A trainer coaches privately *and* at a gym, with different clients in each. A
client trains under two tenants.

## What shipped

| | |
| --- | --- |
| **V37** | `tenant`, `tenant_member`, `trainer.home_tenant_id`, `team.tenant_id`, and a backfill that gave every existing trainer their own `solo` workspace |
| **V38** | `tenant_id` on the 23 tables that carry a `trainer_id` or a `team_id` |
| **V39** | `tenant_id` on the four tables that had no owner at all, plus `exercise`; the stamp, freeze, home-tenant and team-mirror triggers |
| **V40** | revenue shares, the admin placement margin, and `client.stale_at` |
| **V41** | `web_session` — the web's revocable credential |
| **V42** | six session settings, four policy tiers, the `inclineyou_app` runtime role |

Java: `tenant/` (scope, service, controller, revenue, handover),
`config/TenantAwareDataSource`, and an auth interface layer —
`AuthTokenIssuer` with a JWT implementation for the phone and a session
implementation for the web.

**Not shipped, and deliberately: nothing entered sync.** No mobile change was
required, the same shape as V30 and V32–V36.

## The cutover is a configuration change

Every migration is inert until the runtime connects as `inclineyou_app`. Point
`APP_DB_USERNAME` at it to turn the policies on; point it at `inclineyou` to turn them
off. One deploy each way, no migration rollback.

**Development is now on the far side of that switch.** `application.yml`
defaults the pool to `inclineyou_app`, and Flyway got credentials of its own because
DDL and backfills are owner work and an owner is exactly who RLS must not apply
to. Production is still `inclineyou` until someone changes it there.

### The two identities are two pairs of environment variables

| Variable | Role | Who uses it |
| --- | --- | --- |
| `APP_DB_USERNAME` · `APP_DB_PASSWORD` | `inclineyou_app` | the connection pool — **every request** |
| `MIGRATION_DB_USERNAME` · `MIGRATION_DB_PASSWORD` | `inclineyou` | Flyway, the three seed scripts, the test suite |

`DATABASE_URL` is shared; only the login differs. `.env.example` at the repo root
is the checklist, and `docker compose` reads the same file.

Three properties of that naming are deliberate, and each closes a way to get this
silently wrong:

- **`APP_DB_PASSWORD` is one variable doing two jobs** — the pool logs in with
  it, and V42's `appRolePassword` placeholder sets the role's password to it. Two
  names for one secret is how a deployment sets one, misses the other, and cannot
  boot.
- **`DATABASE_USERNAME` / `DATABASE_PASSWORD` still work, as a fallback for the
  *migration* pair only.** That is what they have meant in every environment that
  sets them today, so an existing deployment keeps migrating correctly and only
  has to learn the app role's two variables. They are no longer read by the pool,
  which is the change that matters: before this, `DATABASE_PASSWORD` meant the
  owner's password in CI and the app role's password in `application.yml`.
- **`app.database.app-role` mirrors `APP_DB_USERNAME` rather than being a third
  identity.** It is the role `TenantIsolationTest` logs in as, and if it could
  drift from the pool's login those tests would prove the wall around a role
  nobody serves requests with.

**Rotating `APP_DB_PASSWORD` works on an already-migrated database**, which it
did not at first. V42 sets the role's password, but a versioned migration runs
once — so on every database past its first migrate, changing the variable
changed the pool's login and nothing else, and the first evidence was
`password authentication failed for user "inclineyou_app"` on the next boot.
`afterMigrate__sync_app_role_password.sql` reconciles it on **every** startup,
on Flyway's connection, which is the only identity in the system that may
`ALTER` a role. It is a deliberate no-op when the variable is unset: the
placeholder it reads (`appRolePasswordExplicit`) has no development default, so
a deployment that simply forgot the variable fails to boot rather than having its
runtime login quietly reset to a password published in this repository.

At boot `DatabaseIdentityCheck` asks Postgres `row_security_active('client')` and
logs the answer — `ACTIVE` on a correctly configured runtime, a `WARN` naming the
role otherwise. It is a diagnostic, not a guard: it never fails a boot, because
the owner connection is the *correct* one for the test suite and for migrations.
The question is asked of the database rather than inferred from the username, so
it also catches `BYPASSRLS` on the role and a table that never got a policy.

### What running the app behind the wall found

Four bugs, none of which any test could have caught while the runtime was the
table owner. They are worth reading as a set, because three of them are the same
shape: **a workspace being created is not yet a workspace you are in.**

1. **`CREATE ROLE` skipped the password on an existing role.** A role is a
   property of the cluster, not the database, so it outlives `DROP DATABASE` —
   the `IF NOT EXISTS` guard meant the first database ever built on a server set
   the password and every later `APP_DB_PASSWORD` was silently ignored. Rotating
   the credential would have appeared to work and locked the app out. V42 now
   `ALTER`s when the role is already there.

2. **Nobody could sign up.** The trigger that gives each trainer a solo
   workspace writes to `tenant`, whose policy is keyed on the membership that
   that same insert is what creates. Fixed by making the four workspace-creating
   triggers `SECURITY DEFINER` with a pinned `search_path` — the privilege lives
   inside the trigger, and a direct `INSERT INTO tenant` from the app role is
   still refused, which is asserted.

3. **Nobody could create a team.** Same shape one rung up: creating a team
   creates a workspace, so the row lands in a tenant that is neither the active
   one nor in `app.tenant_ids`, which was computed before the request began.
   `app_owns_tenant()` widens both the read and the write rule on `team` and
   `team_member` to *a workspace you own* — and it must be VOLATILE, because a
   STABLE function reuses the outer statement's snapshot and cannot see the row
   the BEFORE INSERT trigger just wrote. Widening only the write half turned a
   refused insert into a 500 on the read-back two lines later; both halves are
   now asserted together.

4. **The workspace switcher was empty for every new trainer.** This one was
   never about RLS — it was just invisible. Sign-up writes `trainer` and
   `app_user` in one transaction and Hibernate flushes the trainer first, so the
   membership trigger looked the account up by phone and found nothing. The
   trainer got a home workspace they were not a member of. Rather than reorder
   two saves in one service, the pair now completes from whichever row lands
   second.

### The test suite is still on the owner, and that is a known limit

`src/test/resources/application.properties` pins the suite to `inclineyou`. 20 of the
26 test classes are `@Transactional`, which is what makes them clean up after
themselves: Spring binds **one** connection per test and rolls it back. That
connection is borrowed before any request exists, so `TenantAwareDataSource`
labels it with an empty context — and under RLS an empty context is correctly
worth nothing. Every fixture insert is refused, and so is every service call the
test then makes, because they are all on that same unlabelled connection.

Seeding through a second owner-connected `DataSource` does not rescue it: a
second connection is a second transaction, so fixtures stop rolling back and the
next test finds the previous one's trainer sitting on its phone number. Both
were tried.

So isolation is proven where it can be proven honestly — `TenantIsolationTest`
opens its own connections as `inclineyou_app`, labels them exactly as the filter does,
and asserts what is and is not visible. Making all 251 run behind the policies
needs a way to set the six settings on an already-bound connection. It is real
work and it has not been done; the live sign-up, client-create and team-create
paths were exercised by hand against a running server instead.

---

## 1. Where we actually stand

There is **zero** database-level isolation today. All 36 migrations contain no
`ENABLE ROW LEVEL SECURITY`, no `CREATE POLICY`, no `current_setting()`. Every
wall in this product is a hand-written `AND trainer_id = :tid` — **383 SQL
statements across 27 services**, plus a *gate-then-trust* variant in
`ProgressService` where ownership is checked once and the private query methods
below it filter on `client_id` alone.

Two facts make that worse than it sounds:

- The app connects as `inclineyou`, which is also the **schema owner**. A table owner
  bypasses its own policies unless the table is `FORCE ROW LEVEL SECURITY`, so
  even if policies existed today they would do nothing.
- **Three tables carry no ownership column at all** — `set_log`,
  `program_exercise`, `workout_exercise`. They are reachable only by joining a
  parent, so a policy on them would have to be an `EXISTS` subquery evaluated
  per row, on exactly the tables the progress and workout-log queries scan
  hardest.

One forgotten `AND trainer_id` in the 383 is a cross-customer disclosure, and
nothing in the stack would catch it.

---

## 2. Two axes, and they are now independent

This is the whole design in one idea.

| | Question it answers | Column |
| --- | --- | --- |
| **Who coaches** | which human runs this session, writes this plan, is owed this money | `trainer_id` — unchanged, still `NOT NULL`, still what 383 queries filter |
| **Whose books** | which workspace this row belongs to, who collected, who sees it | `tenant_id` — **new** |

Until now those two were the same fact, which is why the schema only has one
column. Under the requirement that a trainer coaches privately *and* at a gym
with different clients, they come apart: **the same `trainer_id` writes rows into
two different tenants**, and which one is decided when the row is created.

Three consequences follow, and they are the substance of the rest of this
document:

1. **`tenant_id` is stamped at insert and never changes.** A row is stamped with
   the workspace it was created in. Nothing needs to move when a trainer joins a
   gym, leaves one, or is removed from a team — the private clients were never in
   the gym's tenant and the gym's clients were never in the private one. An
   immutable column can be enforced by a trigger, which makes it a fact rather
   than a convention.
2. **A person is not a tenant.** Membership is many-to-many, in `tenant_member`.
   The trainer's identity, profile and phone stay one row in `trainer`.
3. **The same human as a client in two tenants is two `client` rows**, which is
   already the shape — `client` is documented as "a person on one trainer's
   roster, and the membership itself". They do not share history: two
   arrangements, two rosters, two sets of measurements.

### The earlier draft's objection is withdrawn

An earlier version of this document argued a team could not be a data tenant,
because `agent/InclineYou_team_coaching_prd.md` §2.4 promises that removing a coach
never cascades into client data. **You have said the PRD is an idea and not an
enforcement, so that argument no longer blocks anything** — and in any case the
model above dissolves it: nothing cascades on removal, because rows were stamped
where they were created and are not re-stamped. The immutability conclusion
survives; only the reason for it changed, and the new reason is better.

---

## 3. Two places the old code refused this — both now fixed

Neither was a PRD opinion. Both were running code.

### 3.1 `ClientPhoneGuard` forbids a person being two people's client

`client/ClientPhoneGuard.java` refuses a phone that appears on any other
trainer's roster, with the code `PHONE_ON_ANOTHER_ROSTER` and the sentence:

> "This number is already on another trainer's roster. **Someone can only be one
> trainer's client at a time** — they need to be removed there before you can add
> them."

That was the exact opposite of "a client can work under two tenants". The guard
now scopes both of its roster checks to the **active workspace**.
`PHONE_ON_ANOTHER_ROSTER` keeps its code and narrows its meaning to "another
coach *in this workspace*" — which is still refused, because two coaches in one
gym both claiming a member is one gym billing them twice.

With no scope at all — a background job, a test — the tenant predicate is
dropped and the guard behaves exactly as it did before tenancy. Failing back to
the **stricter** old rule is the only safe direction.

**The app's copy for that error is now wrong on the phone**, and nothing in
`app/` was touched. It is the one user-visible loose end.

Note the guard's other rule, `PHONE_IS_TRAINER`, is already correct: V18 narrowed
it to refusing only *your own* number on *your own* roster.

### 3.2 The JWT has no room for "which workspace"

The token's subject is a trainer UUID, and nothing else on it says which of that
trainer's workspaces the request is acting in. Writes need that to know where to
stamp `tenant_id`, and reads need it to scope the money book. So the token gains
an **active tenant** claim, and there is a `POST /v1/auth/tenant/{id}` to switch
— the same shape as the existing `POST /v1/auth/mode/trainer | mode/client`.

Tokens live **7 days**, so the filter must resolve a missing claim to the
trainer's home tenant rather than reject the token, or the cutover signs
everybody out.

---

## 4. The model

### Three tenant kinds, all of them data tenants

| `tenant.type` | What it is | Who is in it |
| --- | --- | --- |
| `solo` | One trainer's private practice. Created with the trainer account, and every trainer has one. | one trainer |
| `team` | Several trainers under one owner — today's `team` | many trainers |
| `gym` | A gym org — Ring 2 of the growth roadmap | many trainers, gym admins, gym staff |

All three own rows. What differs is only how many people are in them and what
roles exist. That is what makes one mechanism cover all three, instead of the
gym console needing an isolation scheme of its own.

### The two new tables

```sql
-- V37
CREATE TABLE tenant (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    type                VARCHAR(20)  NOT NULL,   -- solo | team | gym
    name                VARCHAR(160) NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',
                                                 -- active | suspended | closed
    primary_app_user_id UUID         REFERENCES app_user(id),
    metadata            JSONB        NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE tenant_member (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID        NOT NULL REFERENCES tenant(id),
    app_user_id UUID        NOT NULL REFERENCES app_user(id),
    role        VARCHAR(20) NOT NULL,   -- owner | admin | coach
                                        -- | gym_admin | gym_staff | client
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
                                        -- invited | active | declined | removed
    is_home     BOOLEAN     NOT NULL DEFAULT FALSE,  -- opens here by default
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_tenant_member_live
    ON tenant_member (tenant_id, app_user_id, role) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_tenant_member_home
    ON tenant_member (app_user_id) WHERE is_home AND deleted_at IS NULL;
```

**`tenant_member` is where multi-tenancy lives.** One person, N rows. A trainer
who coaches privately and at a gym has two: `(solo tenant, coach)` and
`(gym tenant, coach)`. A trainer who is also somebody's client has a third,
`(that trainer's tenant, client)` — which is the duality V18 opened, generalised.

Four decisions in there, not defaults:

- **`type` and `role` are `VARCHAR`, never a Postgres `ENUM`** — the schema's own
  convention, so adding `gym_staff` is a code change and not a migration on a
  live table.
- **`is_home` belongs to `tenant_member`, not `app_user`.** It takes over
  `app_user.role`'s "which mode does the app open in" job, generalised to
  workspaces. `app_user.role` is **not dropped and not repurposed** — invariant 5
  of the gym PRD — it keeps answering for old builds.
- **`tenant_member` is the same table as the planned `user_role`.** `SCHEMA.md` →
  *Planned: V28+* schedules `user_role (app_user_id, role, scope_type, scope_id,
  status)`. `tenant_id` replaces `(scope_type, scope_id)` outright, because the
  tenant already carries its type. **Build one, not both.**
- **`trainer` does not get a `tenant_id`.** A trainer spans tenants, so a single
  column would have to pick one and be wrong. It gets `home_tenant_id` instead —
  nullable, a **default write target and the key the V38 backfill joins on**,
  explicitly not an ownership column.

### `team` and `team_member` do not go away

A `team` row becomes the satellite of a `team`-type tenant (`team.tenant_id`,
UNIQUE), and `team_member` keeps being written because the additive-only law
forbids dropping it and because it is in the sync surface. **`tenant_member`
becomes the authority and `team_member` becomes a mirror** — new code reads the
former. That duplication is a real cost of the additive-only law and is named
here rather than discovered later; it retires when a migration can finally drop
a column, which under the current law is never.

---

## 5. Enforcement at the database

### 5.1 Two database roles

RLS does nothing while the app connects as the table owner.

| Role | Used by | Configured by | RLS |
| --- | --- | --- | --- |
| `inclineyou` | Flyway, the three seed scripts, the test suite, DBA | `MIGRATION_DB_*` | owner — bypasses |
| `inclineyou_app` | the runtime connection pool, and `TenantIsolationTest`'s own connections | `APP_DB_*` | **policies apply** |

Add `ALTER TABLE … FORCE ROW LEVEL SECURITY` as well, so a future migration that
accidentally reconnects as the owner still gets filtered. Role creation and
`GRANT` need privileges Flyway may not hold on a managed Postgres — treat those
as an ops step in the deployment runbook, with the `ENABLE` and `CREATE POLICY`
statements in the migration.

### 5.2 Request context is session state, set on connection borrow

| Setting | Value | Set for |
| --- | --- | --- |
| `app.tenant_id` | the **active** tenant — the one writes land in | trainer / gym sessions |
| `app.tenant_ids` | **every** tenant this person is a live member of | trainer / gym sessions |
| `app.trainer_id` | the JWT subject | trainer / gym sessions |
| `app.client_ids` | the caller's `client` row ids across every roster | client sessions |

Two tenant settings, because the two questions differ. `app.tenant_ids` is the
read scope — it is what lets one trainer see their whole working day across a
private client at 07:00 and a gym client at 18:00. `app.tenant_id` is the write
target and the money scope; it is always exactly one tenant.

Read them through `STABLE` helpers that return `NULL` when unset, so an unset
value compares to `NULL`, the predicate is false, and the query returns **zero
rows**. A context that failed to be set must starve a query, never widen it.

```sql
CREATE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
-- app_tenant_ids() -> uuid[], app_trainer_id() -> uuid, app_client_ids() -> uuid[]
```

**Set them on connection borrow, not in the controllers.** Ten of the classes
using `NamedParameterJdbcTemplate` carry no `@Transactional`, and `SET LOCAL`
outside a transaction is a no-op with a warning — which under fail-closed means
those endpoints return nothing. So: a `DataSource` wrapper that issues
`set_config(…, false)` for all four on every `getConnection()` and resets on
`close()`. Setting on *every* borrow is what makes a leaked value harmless — the
next borrower overwrites it before its first statement.

### 5.3 Four policy tiers

Policies are `PERMISSIVE`, so tiers 1 and 4 OR together — which is correct,
because a client legitimately reads rows in a tenant they are not a member of.

| Tier | `USING` | Applies to |
| --- | --- | --- |
| **1 — my workspaces** | `tenant_id = ANY (app_tenant_ids())` | the coaching tables |
| **2 — active workspace only** | `tenant_id = app_tenant_id()` | `pack`, `package`, `package_adjustment`, `payment`, `gym_settlement`, `client_note` |
| **3 — catalogue** | `tenant_id IS NULL OR tenant_id = ANY (app_tenant_ids())` | `exercise` |
| **4 — client lens** | `client_id = ANY (app_client_ids())` | the tables `/v1/client/sync/**` reads |

**Tier 2 is the money wall, and it is deliberately not keyed on `trainer_id`.**
In a gym the collector of record is the gym, so the gym's admins must be able to
read payments whose `trainer_id` is a coach — a `trainer_id` predicate would
block exactly the person who banked the money. So the database's rule is *money
belongs to one workspace and you must be standing in it*. Whether one coach in a
team or gym may see **another coach's** money inside that same tenant is then an
application-level `trainer_id` filter, not something RLS can express — **doubt 3
below.**

Every policy needs a `WITH CHECK` as well as a `USING`, or an `INSERT` can plant
a row in another tenant. Tier 1's `WITH CHECK` is the **singular**
`app_tenant_id()`: you may read across your workspaces, you may only write into
the active one.

### 5.4 Do not edit 383 queries

The ask says every query passes `tenant_id`. I would not do that literally, and
the reason is the same one that motivates the ask: **383 places to remember is
383 places to forget.** RLS makes the predicate implicit — the planner applies it
whether or not the author thought about it, which is strictly stronger than a
convention.

- **Reads** — no change. RLS adds the predicate.
- **Writes** — a `BEFORE INSERT` trigger stamps `tenant_id` from
  `app_tenant_id()` when the statement omits it, so the **53 `INSERT`s** need no
  edit either. A second `BEFORE UPDATE` trigger refuses any change to
  `tenant_id`, which is what turns §2's immutability into a fact.
- **Keep every existing `AND trainer_id = :tid`.** RLS is the backstop, not the
  replacement. A forgotten app filter then returns empty rather than another
  tenant's rows — which surfaces as the 404 this codebase already documents for a
  wrong id, instead of as a breach.

---

## 6. The schema afterwards

**34 tables.** 2 new, 29 gaining `tenant_id` (28 `NOT NULL`, `exercise`
nullable), 3 deliberately without. `Tier` is the policy tier from §5.3;
`Backfill` is how V38/V39 fill the column for rows that already exist.

Every existing row predates tenants, so **every backfill resolves to the
trainer's own `solo` tenant**. Teams and gyms start empty and fill from new work
— nothing is moved, which is the point of §2.

### No `tenant_id` — by design

| Table | Why |
| --- | --- |
| `app_user` | A **person**, not a workspace. The whole requirement is that one person spans tenants; a column here would have to pick one. Reachable pre-auth. No RLS. |
| `trainer` | An **identity and a public-facing profile**. It spans tenants for the same reason `app_user` does, and V33–V35 built it for an audience wider than any one tenant — the person deciding whether to accept an invite. Gets `home_tenant_id` (see §4). No RLS; scoped in app code. |
| `otp_request` | Pre-authentication by definition — there is no tenant yet when the row is written. No RLS; already guarded by the attempt lock and send ceiling. |

### The tenant root

| Table | Tier | Note |
| --- | --- | --- |
| `tenant` | `id = ANY (app_tenant_ids())` | New, §4 |
| `tenant_member` | `tenant_id = ANY (app_tenant_ids())` | New, §4. Subsumes the planned `user_role`. **This is the multi-tenancy.** |

### 1. Roster

| Table | Tier | Backfill |
| --- | --- | --- |
| `client` **+ `tenant_id`** | 1 | `trainer.home_tenant_id` via `trainer_id` |
| `body_metric` **+ `tenant_id`** | 1 **+ 4** | via `client_id → client.tenant_id` |
| `client_note` **+ `tenant_id`** | **2** | via `trainer_id` |

The same human on two rosters is **two `client` rows in two tenants**, with
separate goals, measurements and history. `ClientPhoneGuard` must stop refusing
that — §3.1.

### 2. Team

| Table | Tier | Backfill |
| --- | --- | --- |
| `team` **+ `tenant_id` NOT NULL UNIQUE** | 1 | A new `team`-type tenant per live team |
| `team_member` **+ `tenant_id`** | 1 | `team.tenant_id` — mirrors `tenant_member`, §4 |
| `client_assignment` **+ `tenant_id`** | 1 | `team.tenant_id` |
| `team_activity` **+ `tenant_id`** | 1 | `team.tenant_id` |

### 3. Exercise library

| Table | Tier | Backfill |
| --- | --- | --- |
| `exercise` **+ `tenant_id` NULL-able** | **3** | `NULL` for the seeded library — global, every tenant reads it; the trainer's home tenant for `is_custom = TRUE` rows |
| `exercise_favourite` **+ `tenant_id`** | 1 | via `trainer_id` |

`tenant_id IS NULL` means *the shared catalogue* and is the only nullable tenant
column in the schema. A custom exercise written in a gym belongs to the gym; one
written privately does not follow the trainer into it.

### 4. Planning

| Table | Tier | Backfill |
| --- | --- | --- |
| `template` **+ `tenant_id`** | 1 | via `trainer_id` |
| `program` **+ `tenant_id`** | 1 | via `client_id → client.tenant_id` — a plan belongs where its client does |
| `program_exercise` **+ `tenant_id`** | 1 | **via `program_id`** — no owner today |

### 5. Diary

| Table | Tier | Backfill |
| --- | --- | --- |
| `scheduled_session` **+ `tenant_id`** | 1 **+ 4** | via `client_id → client.tenant_id` |
| `working_hours` **+ `tenant_id`** | 1 | via `trainer_id` |
| `time_block` **+ `tenant_id`** | 1 | via `trainer_id` |
| `batch` **+ `tenant_id`** | 1 | via `trainer_id` |

Sessions take the **client's** tenant, not the trainer's home one — that is what
makes a gym session a gym row when the same coach also has private clients. It is
also why tier 1 reads the *plural* setting: one trainer, one day, two workspaces.

`working_hours`, `time_block` and `batch` have **no `updated_at` trigger**
(`SCHEMA.md`) — the backfill must not rely on one, and the stamping trigger must
not accidentally supply one, or the sync cursor changes behaviour.

### 6. Logging

| Table | Tier | Backfill |
| --- | --- | --- |
| `workout_session` **+ `tenant_id`** | 1 **+ 4** | via `client_id → client.tenant_id` |
| `workout_exercise` **+ `tenant_id`** | 1 **+ 4** | **via `workout_session_id`** — no owner today |
| `set_log` **+ `tenant_id`** | 1 **+ 4** | **via `workout_session_id`** — no owner today |

These three are the tables `ProgressService`'s gate-then-trust queries scan.
Giving them a real column keeps their policy an index lookup instead of a per-row
`EXISTS`.

### 7. Money book — tier 2 throughout

| Table | Tier | Backfill |
| --- | --- | --- |
| `pack` **+ `tenant_id`** | **2** | via `trainer_id` |
| `package` **+ `tenant_id`** | **2** | via `client_id → client.tenant_id` |
| `package_adjustment` **+ `tenant_id`** | **2** | via `package_id` |
| `payment` **+ `tenant_id`** | **2** | via `client_id → client.tenant_id` |
| `gym_settlement` **+ `tenant_id`** | **2** | via `trainer_id` |

### 8. Comms & reports

| Table | Tier | Backfill |
| --- | --- | --- |
| `nudge_rule` **+ `tenant_id`** | 1 | via `trainer_id` |
| `nudge_log` **+ `tenant_id`** | 1 | via `client_id → client.tenant_id` |
| `nudge_template` **+ `tenant_id`** | 1 | via `trainer_id` |
| `weekly_report` **+ `tenant_id`** | 1 **+ 4** | via `client_id → client.tenant_id` |
| `attention_dismissal` **+ `tenant_id`** | 1 | via `trainer_id` |

The **once-per-client-per-7-days nudge cap is computed per `client` row**, and
the same human in two tenants is two client rows — so they can receive two
messages in a week, one from each arrangement. That is correct: two coaches, two
relationships. It is worth knowing before somebody reports it as a bug.

### Indexes

Every `tenant_id` gets an index, and the eighteen existing `idx_*_trainer_id`
indexes become **`(tenant_id, trainer_id)`** composites — added, never dropped,
so the additive-only law holds and the old index retires in a later migration
once plans are confirmed.

### The sync wire format does not change

`tenant_id` is **not** added to `/v1/sync/pull` or `/v1/sync/push`, and not to
WatermelonDB's schema v19. A device holds one trainer's slice because the pull
filtered it, and `SCHEMA.md` already says `trainer_id` on the phone "is stored
and indexed but is not a security boundary". **No mobile change is required** —
the same shape as V30 and V32–V36.

One thing this does mean: a trainer in two tenants pulls **both** workspaces onto
one phone, because the pull filters by `trainer_id` and that has not changed.
Their local roster mixes private and gym clients with nothing distinguishing
them until the app adopts the column. Acceptable, and worth writing down.

---

## 7. Migration plan

Next free number is **V37** — V36 is `trainer_account`. The gym PRD's migration
table is still written as V28–V31 and is now **nine numbers behind**; renumber
it, and delete its V28 `user_role` in favour of `tenant_member`.

| | Contents | Risk |
| --- | --- | --- |
| **V37** | `tenant`, `tenant_member`; `trainer.home_tenant_id`, `team.tenant_id`; backfill one `solo` tenant per trainer, one `team` tenant per team, and one `tenant_member` row per existing membership | low — additive, no behaviour change |
| **V38** | `tenant_id` on the 21 trainer-owned tables. Add nullable → backfill → `SET NOT NULL` → FK → index | **the long one.** `payment`, `set_log`, `scheduled_session` are the big tables; batch the backfill |
| **V39** | `tenant_id` on the join-reached tables and on `exercise`; the stamp-on-insert and refuse-on-update triggers | medium — the backfills are joins |
| **V40** | `app_tenant_id()` and friends; `ENABLE` / `FORCE ROW LEVEL SECURITY` and the four policy tiers on 29 tables | **cutover.** Inert until the app connects as `inclineyou_app` |
| **V41** | Retire the superseded single-column `trainer_id` indexes | low, optional |

The app can keep connecting as `inclineyou` right through V40 — policies exist and do
nothing — so the cutover is a **connection-string change, revertible in one
deploy**, not a migration rollback.

### Application changes

| Where | Change |
| --- | --- |
| `client/ClientPhoneGuard` | **§3.1** — stop refusing a number on another tenant's roster. This is the one change that makes the requirement true rather than merely possible. |
| `auth/JwtService` | Claims for the active tenant and its type. A missing claim resolves to `home_tenant_id`; it must never reject a live 7-day token. |
| `auth/AuthController` | `POST /v1/auth/tenant/{id}` to switch workspace, and the verify response lists the caller's memberships — the same shape as `mode/trainer` \| `mode/client` |
| `auth/JwtAuthFilter` | Populate a `TenantContext` once the subject is read |
| `config/TenantAwareDataSource` | New — §5.2. The one piece that has to be right. |
| `team/TeamScope` | Also resolves the tenant set. It is already documented as the *one place* the visible set is resolved. |
| `sync/ClientSyncService` | Populates `app.client_ids` — the client role's subject is a **phone, not a UUID**, and a client on two rosters now genuinely has two ids, which is why tier 4 takes a set |
| `report/WeeklyReportJob` | Runs on a schedule with no request. Must set the context per trainer as it iterates, or run as the owner role. Easy to miss; it is the only one. |
| `API.md` | The `PHONE_ON_ANOTHER_ROSTER` entry, the new auth endpoint, and the authorization table |
| 27 services | **No change.** That is the design. |

### RLS in CI — agreed, and here is what it takes

`.github/workflows/ci.yml` runs `./mvnw -B verify` against a Postgres service
container, connecting as the owner. **As things stand every isolation test would
pass for the wrong reason**, because policies would be inactive. Three changes:

1. Create `inclineyou_app` in the container — a `POSTGRES_INITDB` script, or a Flyway
   `afterMigrate` callback so local and CI stay identical.
2. Point the test datasource at `inclineyou_app`, with Flyway keeping the `inclineyou`
   credentials — migrations must still run as the owner.
3. Add `TenantIsolationTest`, and make it assert the things that would otherwise
   silently regress:
   - two tenants cannot see each other's rows on all 29 tables;
   - **an unset context returns zero rows, not all rows** — the fail-closed
     property, and the one most likely to break silently;
   - a trainer in two tenants sees both under tier 1 and only the active one
     under tier 2;
   - a client on two rosters reads both their own rows and neither of anyone
     else's;
   - an `INSERT` cannot write into a non-active tenant (`WITH CHECK`);
   - an `UPDATE` cannot move a row between tenants (the immutability trigger).

There is **no Redis in CI**, so this suite must not depend on one — it does not.

---

## 8. What this does not do

- **It does not protect against a compromised app.** The app sets the session
  variables, so code inside it can set them to anything. RLS protects against a
  *bug* — the forgotten `AND trainer_id` — which is the realistic threat and the
  one nothing currently catches.
- **It does not separate people inside one tenant.** Two coaches in a gym are one
  tenant to the database. Anything finer is an application `trainer_id` filter.
- **It is not encryption at rest.** NFR-8 is still the deployment's job.

---

## 9. The six questions, and the answers they were built to

| | Answer | Where it lives |
| --- | --- | --- |
| **Which workspace does a new client go in?** | A switcher at the top of the app. | `GET /v1/tenants`, `POST /v1/tenants/{id}/activate`, `tenant_member.is_home` |
| **Combined day or one workspace?** | **Both**, and the trainer chooses. `X-InclineYou-View: focused` narrows; absent or `combined` spans everything. The money book ignores the header — tier 2 is always the active workspace, so a total is never a mix of two businesses. | `AuthTokenFilter`, tier 1 vs tier 2 in V42 |
| **Who sees the money inside a gym or team?** | Roles. `owner` / `admin` / `gym_admin` see the workspace total and the per-coach split; a `coach` sees only their own line and no total. A coach's own revenue is their collections × the percentage set on their membership. An admin also earns a margin on clients **they** placed with somebody else. | `TenantRevenueService`, `tenant_member.revenue_share_percent`, `.assignment_margin_percent` |
| **Two coaches, same person, same gym?** | **No.** Across workspaces yes — that is the requirement. Within one, refused. | `ClientPhoneGuard`, `PHONE_ON_ANOTHER_ROSTER` |
| **A trainer leaves — what happens to the clients?** | They are marked **stale** and stay in the workspace; an admin assigns a new coach. Progress, programs, measurements and payments are the same rows before and after. | `client.stale_at`, `ClientHandoverService` |
| **Cutover appetite?** | V37–V41 are additive and inert. V42 is the flip, and it is a connection-string change. | `app.database.app-role` |

Two details inside the fifth answer, because they are the ones somebody will
trip on:

- **`stale_at` is a column, not a `status` value.** A stale client is still an
  active client — still paying, still owed sessions, still on the roster. What is
  missing is a coach. So every `WHERE status = 'active'` read, on the server and
  on every phone in the field, keeps counting them. V30 made exactly this call for
  `paused_at`.
- **The handover moves the forward-looking work and nothing else.**
  `client.trainer_id`, the current program, and sessions from today onward change
  hands. Logged workouts and collected payments keep their original `trainer_id`,
  because they record who did the work and who took the money — rewriting that
  would falsify the books and the audit at once.

---

## 10. What this still does not do

- **It does not protect against a compromised app.** The application sets the
  session variables, so code inside it can set them to anything. RLS protects
  against a *bug* — the forgotten `AND trainer_id` — which is the realistic threat
  and the one nothing previously caught.
- **It does not separate people inside one workspace.** Two coaches in a gym are
  one tenant to the database; anything finer is an application `trainer_id`
  filter, and `TenantRevenueService` is where that one lives.
- **It is not encryption at rest.** NFR-8 is still the deployment's job.
- **The phone has not adopted `tenant_id`.** A trainer in two workspaces pulls
  both onto one device, mixed, and the `PHONE_ON_ANOTHER_ROSTER` copy in `app/`
  still describes the old, wider rule.
