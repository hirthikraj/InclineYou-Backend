# API review 1 — Programs (`/v1/programs`)

First pass: performance only, measured on the seeded dev DB (14 clients, 23 trainer programs,
12 library programs, 626 workouts, 3,604 workout exercises, 11,460 sets). Code review of the
12 routes comes after you have read this. Nothing was changed in the code or schema.

Method: trainer session, `localhost:8080`, 10 calls per route (first = cold), median and p95 of
the rest. Dev profile, rate limiting off, no gzip on the request.

## Tables and indexes around Programs (quick reference)

Row counts are from the seeded dev DB. Every table below also carries `tenant_id` (stamped by trigger,
immutable) and sits behind the staff row-level-security policy, so a query is filtered by RLS as well as
by `trainer_id`.

The tree is four tables deep: **program → workout → workout_exercise → workout_set**, with
`certified_program` as a one-row-per-library-program extension of `program`.

### `program` (37 rows) — a template, a client's plan, or a library program (`origin`)
Key columns: `origin` (`trainer` / `inclineyou`), `trainer_id`, `client_id` (null = template), `status`
(active / paused / completed), `weeks`, `days`, `start_date`, `end_date`, `copied_from_program_id`,
`synced_at`, `revised_at` (this is the ETag / `If-Match` version), `deleted_at` (soft delete).

| Index | Columns | Serves |
| --- | --- | --- |
| `program_pkey` | `id` | lookups by id |
| `idx_program_shelf` (partial: templates, not deleted) | `trainer_id, updated_at DESC` | the template shelf |
| `idx_program_client` (partial: not deleted) | `client_id, created_at DESC` | a client's plans (`?clientId=`) |
| `idx_program_copied_from` (partial) | `copied_from_program_id` | "who is on this template" and `behind` |
| `uq_program_client_active` (unique, partial) | `client_id` where `status='active'` | **one active plan per client** |
| `uq_program_owner` (unique) | `id, trainer_id, tenant_id` | target of `workout`'s composite FK |
| `uq_program_id_origin` (unique) | `id, origin` | target of `certified_program`'s FK |
| `idx_program_tenant_trainer` | `tenant_id, trainer_id` | RLS / tenant scans |

FKs: `client_id` (and `client_id, tenant_id`) → `client`; `copied_from_program_id` → `program`; `trainer_id` → `trainer`.

### `certified_program` (12 rows) — the InclineYou library's extra fields
`program_id` (PK), `summary`, `level`, `equipment`, `reviewed_at`, `is_sample`, `used_count`, `content_hash`.
Only index: the primary key. FK `(program_id, origin)` → `program(id, origin)`.

### `workout` (635 rows) — one training day inside a program, or a standalone workout
Key columns: `program_id` (null = standalone), `week`, `day`, `position`, `name`, `copied_from_workout_id`, `deleted_at`.

| Index | Columns | Serves |
| --- | --- | --- |
| `workout_pkey` | `id` | |
| `uq_workout_slot` (unique, partial: not deleted) | `program_id, week, day, position` | the tree read, and the counts query's lookup by program |
| `idx_workout_shelf` (partial: standalone, not deleted) | `trainer_id, updated_at DESC` | the standalone workout shelf |
| `uq_workout_id_tenant` (unique) | `id, tenant_id` | target of child FKs |
| `idx_workout_tenant_trainer` | `tenant_id, trainer_id` | RLS / tenant scans |

FKs: `program_id` → `program` (and `program_id, trainer_id, tenant_id`, `ON UPDATE CASCADE`).

### `workout_exercise` (3,604 rows) — a movement in a workout; an alternative points at its main
Key columns: `workout_id`, `exercise_id`, `position`, `alternative_of`, `main_id`, `group_id`, `section`.

| Index | Columns | Serves |
| --- | --- | --- |
| `workout_exercise_pkey` | `id` | |
| `uq_workout_exercise_order` (unique, partial: mains only) | `workout_id, position` | order of main exercises |
| `uq_workout_exercise_alternative` (unique, partial: alternatives only) | `alternative_of, position` | order of alternatives |
| `uq_workout_exercise_main` (unique) | `main_id, workout_id` | target of the alternative FK |
| `uq_workout_exercise_id_tenant` (unique) | `id, tenant_id` | target of `workout_set`'s FK |
| `idx_workout_exercise_exercise` | `exercise_id` | "where is this exercise used" |
| **missing** | **`workout_id` (plain)** | **Finding 1 — the counts query and any join from a workout to all its rows** |

FKs: `workout_id` → `workout`; `exercise_id` → `exercise`; `(alternative_of, workout_id)` → itself, `ON DELETE CASCADE`.

### `workout_set` (11,460 rows) — a prescribed set (load, effort, rest, tempo)
Key columns: `workout_exercise_id`, `position`, `load_kind` / `load_value`, `effort_kind` / `effort_value`, `rest_seconds`.
Indexes: `workout_set_pkey`, `uq_workout_set_order (workout_exercise_id, position)` — enough for the tree read.
FK: `workout_exercise_id` → `workout_exercise`, `ON DELETE CASCADE`.

### Tables that point INTO this tree (a change to a program reaches them)
| Table | Column | Why it matters |
| --- | --- | --- |
| `scheduled_session` | `workout_id` → `workout` | booked sessions are linked to a plan's workouts; `relink` on a tree save or resync |
| `session_exercise` | `planned_from` → `workout_exercise` (`ON DELETE SET NULL`) | a logged session remembers the planned movement |
| `client_schedule_slot` | `program_day` | which program day a weekly slot trains (ordinal, matched on apply) |
| `client_notification` | `kind = 'plan'` (no FK to program) | `POST /{id}/notify` writes a `plan` notice through `mint_client_notification()` |

## Latency

| Route | Status | Cold | Median | p95 | Size |
| --- | --- | --- | --- | --- | --- |
| `GET /programs` (default shelf) | 200 | 38 ms | **37 ms** | 39 ms | 9.7 KB |
| `GET /programs?kind=template` | 200 | 14 ms | 13 ms | 13 ms | 2.4 KB |
| `GET /programs?kind=client` | 200 | 30 ms | **29 ms** | 30 ms | 7.3 KB |
| `GET /programs?clientId=` (client file tab) | 200 | 15 ms | 11 ms | 12 ms | 0.8 KB |
| `GET /programs/certified` | 200 | 10 ms | 7 ms | 9 ms | 10.2 KB, ETag |
| `GET /programs/certified` + `If-None-Match` | 304 | 8 ms | 7 ms | 8 ms | 0 |
| `GET /programs/certified/{id}` (tree) | 200 | 36 ms | **27 ms** | 29 ms | 13.4 KB |
| `GET /programs/{template}` (tree) | 200 | 51 ms | 25 ms | 43 ms | 72.8 KB, ETag |
| `GET /programs/{client plan}` (tree, 10 wk × 3 days, 180 exercises) | 200 | 16 ms | 17 ms | 18 ms | **141 KB**, ETag |
| `GET /programs/{id}/assignments` | 200 | 6 ms | 4 ms | 5 ms | ~0 |
| `POST /programs` copyFrom library | 201 | 61 ms | | | 13.4 KB |
| `PUT /programs/{id}` whole tree | 200 | **136 ms** | | | 13.4 KB |
| `PATCH /programs/{id}` | 200 | 14 ms | | | 0.8 KB |
| `POST /programs` copyFrom template | 201 | 25 ms | | | 13.4 KB |
| `DELETE /programs/{id}` | 204 | 6–8 ms | | | |

Not run, because they change real client data: `POST /{id}/apply`, `POST /{id}/resync`,
`POST /{id}/notify`.

## Finding 1 — the shelf's counts query is the slow part (fix measured)

Every shelf read (`/programs`, `?kind=`, `?clientId=`) ends with one grouped query that counts
workouts and exercises per program (`ProgramJdbcRepository.summaries`). As `inclineyou_app`
(row-level security on) it takes **~40 ms and ~67,000 buffer hits** for 584 workouts:

- `workout_exercise` has no plain index on `workout_id`. The joins on `we.workout_id = w.id`
  use `uq_workout_exercise_main (main_id, workout_id)`, whose leading column is `main_id`, so
  each of the 584 probes scans ~113 index pages.
- The partial `uq_workout_exercise_order (workout_id, position) WHERE alternative_of IS NULL`
  cannot serve it because the query also counts alternatives.
- As the table owner the same query takes 3 ms (no RLS quals), which is why it hides in tests.

Measured fix, created and rolled back inside one transaction, same role, same data:

| | Execution time | Index used |
| --- | --- | --- |
| Now | 40–42 ms | `uq_workout_exercise_main` |
| With `CREATE INDEX idx_workout_exercise_workout ON workout_exercise (workout_id)` | **11 ms** | the new index |

It would be a new additive migration (next free number is `V27`); I have not written it. The same
join shape is probably used by the tree read, the portal plan reads and session creation — worth
checking when those APIs come up.

## Finding 2 — the web asks for the whole shelf to get one number or a list it already has

`getCertifiedShelf()` and `getCertifiedPreview()` (`lib/programs/api.ts`) both fetch
`/v1/programs?kind=template` (the slow query above) only to read `.length` for a tab count.
`getBuilder()` fetches the template list, the template tree, the assignments and the roster in
parallel on every open. The schedule screen and the roster helper call the default
`GET /v1/programs` (37 ms, 9.7 KB). A cheap count (or reusing the list already loaded) would
remove one slow call from each of those pages.

## Finding 3 — payload size and the whole-tree save

- A client plan is 141 KB as JSON, about 23 KB when compressed. The browser only talks to Next,
  so this matters mostly for the Next → backend hop and for Next's own response size; the backend
  does not compress (`server.compression` is not set).
- `PUT /programs/{id}` takes 136 ms for a library-sized tree (about 10× a PATCH). I have not read
  `PlanTreeJdbcRepository.save` yet; to check whether it rewrites the whole tree on every autosave.
- `GET /programs/certified` returns 304 correctly, but it still runs the full query before
  comparing the ETag (7 ms either way), so the 304 saves bandwidth, not database work.

## Frontend fix — duplicate calls on the Programs pages (done, uncommitted)

Observed from the Next dev log (`web app/web/.next/dev/logs/next-development.log`) and reproduced by loading each page with a
trainer cookie. `/programs` itself makes 3 distinct calls — `?kind=client&status=…`, `/v1/clients?view=summary`, `?kind=template`
(the last one only for the *Templates* tab's count) — so those are not repeats. The repeats were:

| Page | Repeated calls before | Backend calls before → after |
| --- | --- | --- |
| every page (browser) | `/v1/notifications?limit=30` ×2, ~60 ms apart, on 37 of 41 logged page loads | 2 → 1 (needs a browser reload to confirm) |
| `/programs/templates` | `?kind=template` ×2 (`requireShelf` + `requireCertifiedShelf`) | 3 → 2 |
| `/programs/{templateId}` (builder) | template list, tree, assignments, roster — all ×2 | 8 → 4 |
| `/programs/certified/{id}` | library tree and template list ×2 | 4 → 2 |
| `/clients/{id}/program/{planId}` | plan, roster, client's programs, source template ×2 | 10 → 5 |

Causes and changes (all in `web app/web`, nothing in the backend):
- `generateMetadata` and the page both called the same guard, so each ran the full fetch. `requireBuilder`,
  `requireCertifiedTemplate` and `requireClientPlan` in `lib/programs/guard.ts` are now wrapped in React `cache()`.
- `lib/programs/api.ts`: a shared `templateRows` (`cache()`d) now backs `getShelf`, `getCertifiedShelf`,
  `getCertifiedPreview` and `getBuilder`, so one render reads the template list once. These reads are only called from
  `guard.ts`, never from a server action, so no write can fall between two reads.
- `components/shell/BellMenu.tsx`: the bell loaded on mount and React StrictMode (dev) mounts effects twice. Overlapping loads
  now share one in-flight promise; a later load is still a fresh read.
- `tsc` shows no errors in the changed files (the only errors are stale `.next/types` entries for deleted pages).

Still open: `/programs` asks for the whole template list (the slow shelf query) just to show a count on a tab. That wants a
cheap count from the backend; it is not changed here.

## Backend fix — the shelf query (done, uncommitted)

`ProgramJdbcRepository.shelf(trainerId, kind, clientId, statuses)` was one method that built its WHERE with a `StringBuilder`.
It is now four reads with constant SQL, chosen by `ProgramReadService.list`: `templates`, `plans`, `plansOf` (one client's plans,
active first) and `shelf` (the default: templates + plans in progress — the only place "a template passes" is written).
Every fragment is a constant and every value a bound parameter.

Three behaviours changed (all 400s or narrowings; no response shape changed):

| Request | Before | Now |
| --- | --- | --- |
| `?status=completed` (no `kind`) | templates **and** completed plans | completed plans only |
| `?kind=template&clientId=X` | 200, empty list | 400 `clientId: a template has no client` |
| `?kind=template&status=…` | 200, status ignored | 400 `status: a template has no status` |

Tests: `ProgramListApiTest` (9 cases) pins every combination, the deleted-client / other-trainer scoping and the template
`activeAssignedCount`. Against the old code exactly the two behaviour tests fail and the other seven pass, so the refactor
preserves everything else. Run on a scratch database (`inclineyou_scratch`), never the seeded dev DB:
`DATABASE_URL=jdbc:postgresql://localhost:5432/inclineyou_scratch ./mvnw test -Dtest=ProgramListApiTest`.
The web calls are unaffected (it uses `kind=client&status=…`, `kind=template`, no params, and `clientId=`).
`API.md`'s Programs section still describes the pre-v1 schema and was not touched.

## Backend fix — `summaries` (done, uncommitted) — also resolves Finding 1 without a migration

`ProgramJdbcRepository.summaries` is the one place a program row becomes a `ProgramItem`; the shelf, one program, the library and
one library program all go through it. It was one method doing three jobs and passing a 30-argument constructor with ten anonymous
placeholders (`0, 0`, `0, 0, List.of()`, five `null`s). It is now:

| Piece | What it is |
| --- | --- |
| `SUMMARY_SQL` | the SELECT and its joins, a constant |
| `summaryOf(rs, row)` | the row mapper, with named locals (`clientId`, `copiedFromId`, `inLibrary`) |
| `ProgramItem.ofRow(...)` | new factory: takes only what a row can say; derives `clientId`, `copiedFromProgramId` and `version` from its arguments so they cannot disagree, and fills the placeholders in one documented place |
| `treeCounts(...)` + `TREE_COUNTS_SQL` | workouts and main exercises per program for the page |
| `summaries(where, params, order)` | now six lines: query, count, merge. `where` and `order` are constants of the class; values are only ever bound |

**Finding 1, fixed in the query instead of the schema.** The exercise count is now a correlated subquery
(`SELECT count(*) FROM workout_exercise WHERE workout_id = w.id AND alternative_of IS NULL`). Its predicate is exactly that of the
existing partial index `uq_workout_exercise_order`, so each workout is one index probe. Measured as `inclineyou_app`, 35 programs:

| | Execution | Index used |
| --- | --- | --- |
| join + `count(DISTINCT …)` (before) | **47.6 ms** | `uq_workout_exercise_main` (~113 pages per workout) |
| correlated subquery (now) | **8.9 ms** | `uq_workout_exercise_order` |

The two queries return identical counts for all 35 programs. The `idx_workout_exercise_workout (workout_id)` migration suggested
in Finding 1 is therefore not needed for this read; it could still help other joins from a workout to all its exercises.

Tests: `ProgramListApiTest` is now 11 cases. `summaryContent` pins that a summary counts live workouts and main exercises only (not a
soft-deleted workout, not an alternative), `copiedFrom`, `behind` (flips when the template moves on), and that `clientId`/`version`
agree with the rest; `library` pins the certified block and that the one-item read agrees with the list. I broke the count on purpose
(counting alternatives) and `summaryContent` failed with `expected 3 but was 4`, then restored it.

## Not Programs, but seen in the sweep (for later reviews)

- `GET /v1/exercises/meta` — **12.5 s** median (!), 9.3 KB.
- `GET /v1/exercises` — 1.3 s, 18.5 KB.
- Everything else I timed in the first sweep was under 80 ms; `GET /v1/portal/sessions` 76 ms and
  `GET /v1/portal/export` 65 ms (322 KB) were the next slowest.

## Housekeeping

The benchmark created two throwaway templates named `ZZ perf probe` and retired them (soft delete),
so they remain in the `program` table until the next seed run.
