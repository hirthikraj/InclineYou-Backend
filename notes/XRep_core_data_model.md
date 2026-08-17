# XRep — Core Data Model & Schema-Evolution Guide

**Version:** 1.0 · **Goal:** a core schema that lets you add features *without modifying or breaking what exists*.
**Non-negotiable, and why:** old app versions live on users' phones you can't force-update. So the backend must stay compatible with old clients, and clients must tolerate data from a newer backend. Additive-only is the law, in the database and the API.

---

## 1. The schema-evolution contract

These rules are the whole point. Every future change must obey them.

| Allowed (additive) | Forbidden (breaking) |
|---|---|
| Add a **new nullable column** (or with a default) | Rename a column |
| Add a **new table** (FK to a core entity) | Change a column's type |
| Add a **new key** inside a `metadata` JSONB column | Drop / delete a column |
| Add a **new allowed value** to a string status/type | Repurpose a column's meaning |
| Add a **new optional field** to an API response | Remove or rename an API field |

**Deprecation, not deletion:** if a column becomes obsolete, stop writing to it and mark it deprecated in docs — but leave it in place. Old clients may still read it.

---

## 2. Global conventions (apply to every table)

1. **Standard columns on every table:**
   - `id` — UUID, **generated on the client** (so offline-created rows have stable IDs before sync).
   - `created_at`, `updated_at` — timestamptz (sync + audit rely on `updated_at`).
   - `deleted_at` — timestamptz, nullable (**soft delete**; never hard-delete — deletions must sync).
2. **`metadata JSONB NOT NULL DEFAULT '{}'` on every core entity.** The zero-migration escape hatch for small, feature-specific, low-query data. Promote a key to a real nullable column only when you need to query, index, or constrain it heavily.
3. **Statuses / types / categories are strings, not DB enums.** Validate allowed values in application code. Adding a value is then a code change, not a migration. (If you ever need referential control, back a field with a lookup *table* — still additive — rather than a Postgres `ENUM`.)
4. **Detail / history tables are append-only** (`set_log`, `payment`, `nudge_log`). Insert new rows; don't mutate history.
5. **Flexible where prescriptions vary, numeric where you compute.** Program *targets* are strings ("8–12", "bodyweight"); *actual* logged values are numeric (needed for PR math).
6. **API discipline:** version the base path (`/v1`), additive-only responses, and a **tolerant reader** on both ends — unknown fields are ignored, never fatal.

---

## 3. Core entities (field-level)

Types shown are Postgres. Every table also has the standard `id`, `created_at`, `updated_at`, `deleted_at`, and `metadata` from §2 (not repeated below).

### 3.1 `trainer`
| Column | Type | Null | Notes |
|---|---|---|---|
| phone | varchar | no | unique; login identity |
| name | varchar | yes | |
| upi_vpa | varchar | yes | the trainer's own UPI ID; used to build UPI links for clients they collect from directly |

> A trainer may serve gym and freelance clients at the same time, so there is no trainer-level "type". When the `gym` entity arrives later, a nullable `gym_id` FK can simply be **added** here — additive, no change to existing columns.

### 3.2 `client`
| Column | Type | Null | Notes |
|---|---|---|---|
| trainer_id | uuid (FK→trainer) | no | owner |
| name | varchar | no | |
| phone | varchar | yes | |
| goal | varchar | yes | |
| status | varchar | no | `active` \| `paused` (string) |
| height_cm | numeric(5,1) | yes | baseline intake (static) |
| activity_level | varchar | yes | intake: `sedentary` \| `light` \| `moderate` \| `active` (string) |
| payment_mode | varchar | no | `trainer_collects` \| `gym_collects`; **set per client** (one trainer serves both kinds), chosen when the client is added |
| trainer_split_percent | numeric(5,2) | yes | trainer's revenue share for this client; null or 100 = trainer keeps all (freelance); e.g. 60 for a gym client on a 60/40 split. Drives the dashboard split view |
| note | text | yes | free text; **no medical fields** |

> Weight and other changing measurements are **not** stored here — they go in `body_metric` (§3.13) as append-only time-series so progress can be charted. Extra intake questions beyond the structured fields above live in `metadata` (JSONB) until one is common enough to promote to its own column.

### 3.3 `exercise` (shared library + custom)
| Column | Type | Null | Notes |
|---|---|---|---|
| name | varchar | no | |
| muscle_group | varchar | yes | string taxonomy; the **primary** muscle ("pectorals", "abs") |
| body_part | varchar | yes | the coarse ten-way split — `back`, `cardio`, `chest`, `lower arms`, `lower legs`, `neck`, `shoulders`, `upper arms`, `upper legs`, `waist`. What the library screen groups by: the muscle is the right grain for a filter and too fine for a section heading, which would split one chest across "pectorals", "serratus anterior" and "delts" |
| target | varchar | yes | the primary muscle again, but only where the seed said so. Null on a trainer's own exercise — which is what keeps custom rows out of the filter's vocabulary while `muscle_group` still describes them |
| equipment | varchar | yes | string |
| movement_pattern | varchar | yes | e.g. push/pull/hinge/squat. Unset on the current seed, which does not classify by force |
| level | varchar | yes | unset on the current seed, which does not grade exercises beginner/expert |
| image_url | varchar | yes | null on every seeded row — the library is text-only (see below). Retained as the seam a future image set would arrive through |
| video_url | varchar | yes | null throughout; held the demo loop until the media was retired in V22. Nothing reads it |
| owner_trainer_id | uuid (FK→trainer) | yes | null = shared/seeded library; set = this trainer's custom exercise |
| source | varchar | no | origin: `custom`, `exercises-dataset`, or a future seed source. Single indicator of where the exercise came from (replaces a separate `is_custom` flag) |

> **The seeded library is [`hasaneyldrm/exercises-dataset`](https://github.com/hasaneyldrm/exercises-dataset)** — 1,324 exercises: names, body parts, equipment, targets and step-by-step instructions. **Text only.**
>
> ⚠ **Its licence is split, and we take only the half that was offered.** The *data* is MIT and is what we seed. The *media* — a 180×180 still **and** a 180×180 animation GIF per exercise — is **© Gym visual (https://gymvisual.com/)**, redistributed upstream under a written permission granted to that repository and not travelling with a clone. It is therefore **not seeded**: `scripts/build-exercise-seed.py` drops the paths before they reach the classpath, and V22 cleared the rows that briefly carried them.
> 
> The stills fall under this too. They are frames of the same artwork, so dropping only the animations would have left the same problem in a quieter form. If a Gym visual licence is ever bought — a one-time N-CRFL, priced per asset — the media returns at full resolution and the seam is `image_url` / `video_url`, both of which still exist.
>
> **Replacing the seed source is a migration, not an edit.** Two libraries share no identifiers, so retiring one means soft-deleting its rows and seeding the new one alongside — per the evolution contract in §5. Programs and set logs pointing at a retired exercise keep their history and their foreign keys; the exercise simply reads as removed until it is re-picked. There is no honest automatic remapping between libraries, and guessing one silently rewrites what a trainer recorded.

### 3.4 `program`
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| name | varchar | yes | |
| is_active | boolean | no | |
| template_id | uuid (FK→template) | yes | set if created from a template |

### 3.5 `program_exercise` (which exercises are in a program)
| Column | Type | Null | Notes |
|---|---|---|---|
| program_id | uuid (FK→program) | no | |
| exercise_id | uuid (FK→exercise) | no | |
| day_index | int | no | e.g. 0–6 |
| order_index | int | no | ordering within the day |
| target_sets | int | yes | |
| target_reps | varchar | yes | **string** ("8–12") |
| target_load | varchar | yes | **string** ("bodyweight", "60kg") |
| notes | varchar | yes | |

### 3.6 `template`
| Column | Type | Null | Notes |
|---|---|---|---|
| trainer_id | uuid (FK→trainer) | no | |
| name | varchar | no | |
| structure | jsonb | no | reusable blueprint (days/exercises/targets); applied by copying into a `program` |

### 3.7 `workout_session`
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| program_id | uuid (FK→program) | yes | |
| scheduled_session_id | uuid (FK→scheduled_session) | yes | the appointment it fulfilled |
| performed_at | timestamptz | no | |
| logged_by | varchar | no | `trainer` \| `client` |
| status | varchar | yes | e.g. `completed` |
| note | varchar | yes | |

### 3.8 `set_log` (append-only)
| Column | Type | Null | Notes |
|---|---|---|---|
| session_id | uuid (FK→workout_session) | no | |
| exercise_id | uuid (FK→exercise) | no | |
| set_number | int | no | |
| load_kg | numeric(8,2) | yes | **numeric** (PR math) |
| reps_done | int | yes | numeric |
| rpe | numeric(3,1) | yes | numeric |
| note | varchar | yes | |

> PRs are **computed on read** from the numeric `load_kg`/`reps_done` history — not stored as a column. Cache the computed result at the app/read-model layer if performance needs it.

### 3.9 `package`
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| type | varchar | no | `session_pack` \| `monthly` (string) |
| total_sessions | int | yes | null for pure monthly |
| sessions_remaining | int | yes | decrements on session delivered |
| amount | numeric(12,2) | yes | optional (may be untracked when gym collects) |
| currency | varchar | no | default `INR` |
| paid_upfront | boolean | yes | |
| start_date | date | yes | |
| expiry_date | date | yes | |
| status | varchar | no | `active` \| `expired` \| `overdue` \| `completed` |

### 3.10 `payment` (single, dual-mode; append-only)
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| package_id | uuid (FK→package) | yes | |
| amount | numeric(12,2) | yes | nullable (gym-collected may be a paid flag only) |
| currency | varchar | no | default `INR` |
| method | varchar | no | `upi` \| `cash` \| `front_office` (string) |
| collected_by | varchar | no | `trainer` \| `gym` (**captures the dual mode**) |
| status | varchar | no | `pending` \| `confirmed` |
| upi_ref | varchar | yes | optional reference the trainer/client enters |
| confirmed_by | varchar | yes | `trainer` \| `client` |
| paid_at | timestamptz | yes | |

### 3.11 `scheduled_session` (appointment)
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| trainer_id | uuid (FK→trainer) | no | |
| package_id | uuid (FK→package) | yes | decrement on `done` |
| start_time | timestamptz | no | |
| duration_min | int | yes | |
| status | varchar | no | `scheduled` \| `done` \| `no_show` \| `cancelled` |
| workout_session_id | uuid (FK→workout_session) | yes | the session logged for it |

### 3.12 `nudge_log`
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| type | varchar | no | `session_reminder` \| `checkin` \| `payment_reminder` \| `renewal` (string) |
| channel | varchar | no | `whatsapp` (string; extensible to `sms`/`push`) |
| template_id | varchar | yes | the BSP/Meta template used |
| payload | jsonb | yes | variables sent |
| status | varchar | no | `queued` \| `sent` \| `failed` |
| sent_at | timestamptz | yes | |

### 3.13 `body_metric` (append-only time-series)
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| type | varchar | no | `weight` \| `waist` \| `chest` \| etc. (string; extensible) |
| value | numeric(8,2) | no | numeric (charted over time) |
| unit | varchar | no | e.g. `kg`, `cm` |
| recorded_at | timestamptz | no | |
| recorded_by | varchar | yes | `trainer` \| `client` |

> Powers weight/measurement progress charts. Append-only: log a new row each time; never mutate history. Height lives on `client` (static); weight lives here (changes over time).

---

## 4. Relationships (summary)

```
trainer 1─* client 1─* program 1─* program_exercise *─1 exercise
   │            │
   │            ├─* workout_session 1─* set_log *─1 exercise
   │            ├─* package 1─* payment
   │            ├─* scheduled_session ─(fulfilled by)→ workout_session
   │            ├─* body_metric
   │            └─* nudge_log
   ├─* template ─(applied to)→ program
   └─* exercise   (custom; owner_trainer_id null = shared library)
```

---

## 5. How to extend later (worked examples — all additive)

**Add nutrition / diet plans:** create a new `diet_plan` table with `client_id` FK. Core tables untouched. No migration to `client`.

**Body metrics (done):** `body_metric` (§3.13) was added exactly this way — a new append-only table with a `client_id` FK, zero change to existing tables. This is the additive pattern working on its first real feature. Wearable/device *auto-sync* stays a future add-on that would write into the same table.

**Add health-issue notes (when DPDP-ready):** create a new `health_note` table with its own access controls and consent, `client_id` FK. Kept out of `client` precisely so sensitive data is isolated and addable later.

**Add a new payment method (e.g. a gateway):** add `razorpay` to the allowed values of `payment.method` (a code change) and, if needed, a nullable `gateway_txn_id` column. Old payments and old clients keep working.

**Add a new nudge channel (SMS):** add `sms` to `nudge_log.channel`'s allowed values. No schema change.

**Add a new package cadence (quarterly):** add `quarterly` to `package.type`. No schema change.

**Attach a small flag to a client with no migration at all:** write it into `client.metadata` (e.g. `{"referral_source":"instagram"}`). Promote to a real column later only if you start querying it heavily.

---

## 6. Anti-patterns to avoid

- **Postgres `ENUM` types** for status/type — adding a value needs `ALTER TYPE` (a schema change) and is painful to reverse. Use strings.
- **Full EAV** (one generic attribute-value table for core data) — destroys query-ability and integrity. Use real columns + new tables + JSONB instead.
- **Non-nullable new columns without a default** — breaks existing rows and old code. New columns are nullable or defaulted.
- **Hard deletes** — break sync and audit. Soft-delete with `deleted_at`.
- **Repurposing a column** when meaning changes — add a new column instead; deprecate the old one.
- **Overusing JSONB** for data you filter/join/constrain on — that belongs in real columns. JSONB is for the long tail, not the core.

---

## 7. Implementation notes

**PostgreSQL / Spring Boot (JPA/Hibernate):**
- `uuid` → `java.util.UUID`; generate in the app, not the DB.
- `jsonb` → map with Hibernate 6 `@JdbcTypeCode(SqlTypes.JSON)` (or the hypersistence-utils library).
- Money → `numeric(12,2)` → `BigDecimal`.
- Timestamps → `timestamptz` → `Instant`/`OffsetDateTime`.
- Migrations via **Flyway** (or Liquibase) — every migration is additive (new columns nullable, or new tables). Never write a migration that drops/renames/retypes a core column.

**On-device SQLite (WatermelonDB):**
- SQLite has no native `uuid` or `jsonb` — store UUIDs as `TEXT`, JSON as `TEXT`, timestamps as ISO-8601 `TEXT` (or epoch millis). Mirror the same columns and the same additive discipline.
- Keep the on-device schema and the server schema in lockstep; both evolve additively.

**Sync fields:** `updated_at` drives incremental pull/push; `deleted_at` propagates deletions; client-generated `id` keeps offline creates idempotent. (Details in the handover's sync section.)
