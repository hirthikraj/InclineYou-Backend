# InclineYou — Core Data Model & Schema-Evolution Guide

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
| headline | text | yes | **V33** · one line under the name — "Strength & fat-loss coach · Indiranagar". Capped at 80 characters in `TrainerService`, not in the column |
| bio | text | yes | **V33** · 100–200 words, capped at 1200 characters. Over the cap is a **400, not a truncation** — every other string on the profile endpoint truncates silently, which is right for a pasted name and wrong for prose |
| intro_video_url | text | yes | **V33** · a YouTube link, stored **canonical**: `https://www.youtube.com/watch?v=<id>`. Any share-sheet shape is accepted and reduced; a `t=` offset, a `list=` playlist and every tracking parameter are dropped |
| map_link | text | yes | **V34** · the gym or studio on a map, stored **verbatim** — no canonicalisation, unlike `intro_video_url`. Refused over 500 characters and refused if it is not an `http(s)` URL; a cut URL is broken, not shortened |
| training_modes | jsonb | no `[]` | **V34** · how the coaching is delivered: `gym_floor` \| `home_visit` \| `online` \| `hybrid`, plus `custom:`-prefixed entries. GIN-indexed, like `languages` |
| service_areas | jsonb | no `[]` | **V34** · free-text localities the trainer travels to. Deliberately not a catalogue |
| instagram_url | text | yes | **V35** · stored **canonical** — `https://www.instagram.com/<handle>`. A bare `@handle`, the share URL with its `igsh=` token and the desktop URL all reduce to one string; a post or reel link is refused |
| youtube_url | text | yes | **V35** · the **channel**, not a video — `intro_video_url` is the one video. Canonical `https://www.youtube.com/<@handle \| channel/… \| c/… \| user/…>`, the path kept exactly as given |
| email | varchar(254) | yes | **V36** · a **contact detail, not a login**. Deliberately not unique and not indexed — uniqueness is a property of a credential, and two trainers sharing a studio inbox is not an error. Refused over the cap and refused if it is not shaped like an address; nothing in the product branches on it |

> A trainer may serve gym and freelance clients at the same time, so there is no trainer-level "type". When the `gym` entity arrives later, a nullable `gym_id` FK can simply be **added** here — additive, no change to existing columns.

> ### V33 · identity, and the field that is not in it
>
> V8 collected the six setup answers and every one of them is a fact the app
> itself consumes — `experience_band` and `specialities` filter, `languages`
> carries a GIN index because clients search on it, `upi_vpa` is a payment rail.
> These three are different in kind: **nothing in InclineYou branches on any of them.**
> They exist so the person deciding whether to accept an invite can see who is
> asking, which is why they sit next to `name`, the one other column here that
> has always been for somebody else's eyes.
>
> **All three are `text`, and that is the additive-only law showing through.**
> Every length here is a product decision that will be argued again, and under a
> law that forbids retyping a column a `varchar(80)` makes "let them write 100" a
> migration. `text` costs nothing in Postgres and puts the cap in code.
>
> **The profile photo is not here.** It needs a store this service does not have
> — no multipart endpoint, no object-store config, no image pipeline anywhere —
> so it is a pass of its own rather than a column smuggled in behind three text
> fields. Until it lands the initials avatar both halves already draw is the
> trainer's face, and the setup step says so in as many words.
>
> **V33 is backend + web only**, per V26's, V28's, V29's, V30's and V31's
> argument. Nothing enters sync: the three columns are absent from the trainer
> upsert, so no phone build notices, and a trainer who fills this in on the web
> sees none of it on their phone until it adopts the REST route. The web collects
> the headline on setup step 1 and the other two on `/settings/profile`; the
> phone's setup flow is untouched and still asks for the name alone.

> ### V34 · where a trainer works, which is not how they are paid
>
> `work_mode` (V23) and `gym_name` (V11) were already here, and the obvious move
> was to draw those and call the profile's *where* section done. Both of those
> migrations refuse it themselves: `work_mode` is **a hint, not a type** — the
> money book's defaults, deciding which price lists exist and who is
> pre-selected to collect — and V23 says in bold that it must never gate a
> feature.
>
> **How a trainer is paid and how they coach are different answers, and neither
> is derivable from the other.** A trainer whose `work_mode` is `gym` may still
> take home visits on Sundays; an `independent` one may work out of a studio
> they do not own. So V34 sits beside those two rather than reinterpreting them,
> and the money book keeps reading only the originals.
>
> **`map_link` is verbatim and `intro_video_url` is canonical, on purpose.** A
> YouTube link has one canonical form and one field that matters, so reducing it
> is a service. A maps URL is a short `maps.app.goo.gl` redirect from one share
> sheet, a long `/maps/place/…@lat,lng,z/data=` string from another, and
> something else again from Apple or OpenStreetMap — a normaliser would
> eventually break a link that worked. The only check is that it is a URL.
>
> **`service_areas` is not a catalogue**, unlike every other list on this table.
> No locality list this product could ship would be right in two Indian cities,
> and a dropdown missing somebody's neighbourhood is worse than a field. It
> exists because `home_visit` with no answer to *how far* is not information a
> client can act on.
>
> **V34 is backend + web only**, per V26's, V28's, V29's, V30's, V31's and V33's
> argument. Nothing enters sync. The web edits all three on
> `/settings/profile/work` — the profile's sixth tab, which also carries the
> `working_hours` editor and is therefore the one profile screen writing two
> tables over two protocols — and the phone's flow is untouched.

> ### V35 · where a client goes to check
>
> Every other column on this table is the trainer's own account of themselves,
> and none of it is checkable. A client deciding whether to accept an invite
> wants evidence, and they will look for it on Instagram whether or not this
> product links it — so it links it. A trainer's feed is years of gym-floor
> video shot by somebody who was not selling that client anything, and it
> settles what a bio can only assert. The audience is the trainer's; nothing
> here reposts, counts followers, or comes between them.
>
> **Two named columns, not a `social_links` list.** A column should be as
> specific as its question. A generic list would need a platform catalogue to
> render an icon, would collect one trainer's "insta" beside another's
> "Instagram", and could not check that a row was a real profile URL. Two named
> columns can be validated, canonicalised and rendered exactly. A third platform
> is a migration, and that is the honest price.
>
> **Both are canonical, which puts them with `intro_video_url` and not with
> `map_link` two rows up.** The seam is worth keeping: a profile reduces to a
> handle and a video reduces to an id — both are the whole fact — while a place
> reduces to nothing. So a share token is dropped here and a maps URL is kept
> verbatim there, and neither is an inconsistency.
>
> **What the canonicaliser may not do is rewrite the identifying part.** A
> YouTube channel is addressable four ways and they are not interchangeable, so
> the path is kept as given and only the scheme, host and query are normalised —
> resolving between them would need a call to YouTube, and no write path here
> reaches the network. `youtube_url` is a channel and `intro_video_url` is one
> video: two promises to a client, so a watch URL pasted into the first is
> refused with a sentence naming the field that wants it.
>
> **V35 is backend + web only**, per the same argument as V30, V32, V33 and V34.
> Nothing enters sync. The web edits both on `/settings/profile/social` — the
> profile's seventh and last tab — and the phone's flow is untouched.

> ### V36 · the account — and it is not a section of the profile
>
> One column, `email`, and two things that needed no column at all.
>
> **The email is not a second login, and the schema says so rather than leaving
> it to be assumed.** There is no email anywhere else in this product: sign-in is
> a phone number and a six-digit code, and the backend has no mail transport, no
> verification token table and nothing that could send one. So it is stored,
> shown back, and branched on by nothing — the position `bio` has been in since
> V33. Not unique, not indexed, and refused over 254 (RFC 5321's ceiling) rather
> than truncated, because half an address is not a shorter address, it is a wrong
> one. The obvious next feature — *sign in with your email* — is a verification
> round trip away, not a column.
>
> **Changing the number needed no schema at all.** `POST
> /v1/trainers/me/phone/{challenge,verify,request,confirm}` proves BOTH numbers
> with the OTP machinery that already exists — two codes, two `otp_request`
> keys — and rewrites `trainer.phone` and `app_user.phone` in one transaction.
> The old number is proved because a seven-day bearer token would otherwise be
> enough to walk an account onto a number a thief controls; the new one is proved
> because a mistyped last digit is an account moved to a stranger's phone with no
> way back. The *you proved the old number* step is a **ten-minute signed
> ticket**, not a row: a table would be a second place for a half-finished change
> to live, and a row nobody sweeps outlives the SIM it is about.
>
> **Deleting is `deleted_at` on `trainer` and `app_user`, and the number is not
> released.** There is no hard delete and there cannot be a cheap one —
> `client.trainer_id` is NOT NULL and twenty tables hang off `client` in turn, so
> removing the row takes a year of somebody's sessions, packages and payments
> with it. Both phone columns are plain UNIQUE indexes rather than partial on
> `deleted_at`, so the closed account keeps its number and a fresh sign-up on it
> is refused. That is deliberate: the trainer's own rows still point at that
> row, and handing the number to a second person would put a stranger's sign-in
> next to a year of somebody else's money. The confirm step says so before the
> button works, because it is the one consequence a trainer cannot discover by
> trying it once.
>
> **V36 is backend + web only**, like V30, V32, V33, V34 and V35 — nothing enters
> sync, and the phone has no account screen. Which has a consequence worth
> naming: **a phone build signed in on a number that was changed on the web keeps
> a valid token**, because a trainer token's subject is the trainer id and not the
> phone, and only the `phone` claim goes stale. Nothing on a trainer's path reads
> that claim today. A phone build signed in to a DELETED account keeps working
> offline until its next sync, which then 404s.

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
| ~~note~~ | — | — | **never built.** Listed here from the first draft and absent from `V1__init_schema.sql`; trainer notes live in `client_note` (§3.14), one row per note, from V29 |

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
| schedule | jsonb | yes | the client's chosen layout, written by apply: `[{"day":1,"weekday":2,"time":"06:30"}, …]` — which weekday each template day slot lands on, and when. Null on programs assigned before slots and weekdays were separate |

### 3.5 `program_exercise` (which exercises are in a program)
| Column | Type | Null | Notes |
|---|---|---|---|
| program_id | uuid (FK→program) | no | |
| exercise_id | uuid (FK→exercise) | no | |
| day_index | int | no | e.g. 0–6 |
| order_index | int | no | ordering within the day |
| target_sets | int | yes | |
| target_reps | varchar | yes | **string** ("8–12") |
| duration_seconds | int | yes | a timed prescription — "3 × 45s" — carried **instead of** reps, never alongside. Chosen per prescription when the exercise is added, because nothing in the library marks an exercise as a hold |
| target_load | varchar | yes | **string** ("bodyweight", "60kg") |
| notes | varchar | yes | |
| tempo | text | yes | **V31** · "3010" — eccentric / pause / concentric / pause. Free text, because trainers write it as one token and the notations in use disagree about the order; "31X0" has an X in it, and four smallint columns could not hold the notation actually used |
| alt_exercise_id | uuid (FK→exercise) | yes | **V31** · "or the chest press machine, when the bench is taken." Inherits this row's prescription rather than carrying its own |
| group_id | uuid | yes | **V31** · shared by the adjacent members of one superset. **A correlation id, not an FK** — minted per PROGRAM, so two clients on the same template never share one |
| set_detail | jsonb | yes | **V31** · one object per set, `[{"reps":12},{"to_failure":true}]`. Written only once the sets DIVERGE — see the note below |

> ### V31 · the four things a blueprint could not say
>
> An **alternate**, a **superset**, per-set reps with any set taken to
> **failure**, and a **tempo**. All four already had somewhere to live on the
> template side, because `template.structure` is jsonb and a new key needs no
> migration. What they had nowhere to live is the client's copy — this table is
> fixed columns and apply copies column by column — so a superset authored on a
> blueprint would have been silently flattened the moment somebody was assigned
> to it. The trainer would see it and the client would never get it.
>
> Each degrades honestly in a build that predates it, which is the whole test
> under the additive-only law and the reason none of them is a sentinel in a
> field that already means something else. A missing `alt_exercise_id` draws no
> alternate and the plan is exactly the plan it was. A `group_id` an old reader
> knows nothing about renders two exercises adjacent and in order — a superset
> performed as straight sets, degraded and not wrong, which is why grouping is a
> shared key on adjacent rows rather than a nested structure that reader could
> not walk.
>
> **`set_detail` is the one with a rule.** The scalar `target_sets` and
> `target_reps` stay, and stay authoritative *while the sets agree*: a straight
> 4 × 12 writes `sets:4, reps:12` and an old build is exactly right. The moment
> the sets diverge, `reps` is written **null** and `sets` keeps the count — so an
> old build reads "4 sets", which is incomplete but true. It is never handed a
> number that is wrong for half the sets, and never a sentinel like `reps: -1`
> that it would render as "minus one reps". jsonb rather than a child table
> because the blueprint it mirrors is already JSON, because a new synced table
> costs a sync contract, and because it leaves room for a per-set rest or load
> later without another migration.
>
> **V31 is backend + web only**, per V26's, V28's, V29's and V30's argument.
> Nothing enters the sync envelope, so no phone build notices; the blueprint keys
> travel inside `template.structure`, which the phone already preserves verbatim
> when it rewrites one.

### 3.6 `template`
| Column | Type | Null | Notes |
|---|---|---|---|
| trainer_id | uuid (FK→trainer) | no | |
| name | varchar | no | |
| structure | jsonb | no | reusable blueprint (days/exercises/targets); applied by copying into a `program`. **Stored snake_case** — `exercise_id`, `day_of_week`, `rest_seconds`, `order_index`, `week` — because the phone's `parseBlueprint` keys on it. `GET /v1/templates` translates to camelCase on the wire; until 28 Aug 2026 it leaked these keys instead, and its only REST consumer read every field as absent |
| weeks | int | yes | **V20** · how long the block runs. Writable over REST only since V31 |
| training_days | text | yes | **V24** · the ordinal slots the trainer laid out, `"1,2,3"`. Writable over REST only since V31 — and it is the authority, because **a day exists when the trainer lays it out, not when an exercise lands on it**: inferring the list from the blueprint alone puts the first exercise on Day 1, makes Day 1 the only day the program has, and leaves nowhere to put Day 2's first exercise |

> **A template's days are ordinal slots, not weekdays.** "Day 1".."Day 7" is what the blueprint and `training_days` mean; which weekday each slot lands on (and at what time) is the client's preference, captured at apply time in `program.schedule`. Apply refuses a schedule that does not cover the template's day slots exactly — one distinct weekday per slot — and translates each blueprint entry's slot to its landed weekday as it copies, so the client's `program_exercise` rows stay concrete. Templates authored before this (when the numbers meant weekdays) were soft-deleted rather than reinterpreted (server V24).

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
| type | varchar | no | `session_pack` \| `monthly` \| `single` (string) |
| sessions_total | int | yes | null for pure monthly |
| sessions_remaining | int | yes | decrements on session delivered |
| amount | numeric(10,2) | no | what **this client** owes — already net of any discount |
| currency | varchar | no | default `INR` |
| start_date | date | yes | |
| end_date | date | yes | null = no expiry, which is what most Indian trainers actually sell |
| status | varchar | no | `active` \| `completed` \| `expired` — see the sweep below |
| pack_id | uuid (FK→pack) | yes | V11 · which price-list entry it was sold from |
| due_date | date | yes | V11 · when the money is owed by; null reads as *due, not late* |
| written_off_at / written_off_amount | timestamptz / numeric | yes | V11 · a write-off is not a delete |
| discount_amount | numeric(10,2) | yes | V19 · what was knocked off the list price. `amount` is already net; this records *why* it is lower |
| paused_at | timestamptz | yes | **V30** · set while the clock is stopped, null while running |
| paused_days | int | no | **V30** · days spent paused, all time — how far `end_date` has been pushed out |
| closed_at | timestamptz | yes | **V30** · when it stopped being live |

> **Three column names in this table were wrong from the first draft** and are
> corrected above: `total_sessions` → `sessions_total`, `expiry_date` →
> `end_date`, and **`paid_upfront` never existed** — it is absent from
> `V1__init_schema.sql`, and how much has been paid is derived from `payment`
> rows, not stored. Same class of drift as `client.note` in §3.2. `overdue` was
> likewise never a `package.status`; it is a `payment.status`.
>
> **Amounts are derived, not stored.** `amount_paid` is the sum of this package's
> payments whose status is `paid` **or** `confirmed` — REST writes the first, the
> sync envelope has carried the second since V1, and both mean *the money
> arrived*. `amount_due` is `amount − paid − written_off`, floored at zero. Both
> are computed in SQL on `PackageResponse` rather than by each caller, because
> three components on the web summed only `confirmed` and showed every paid-up
> client as owing the full amount.
>
> **Partial payment needs no schema of its own** and never did: "₹2,000 now and
> the rest on Tuesday" is two `payment` rows against one package. Only the reading
> of it was ever wrong.
>
> ### V30 · a package has a life
>
> V1 gave a sold package a count, a price and two dates; V11 gave it a debt side.
> Between "sold" and "paid for", **nothing could happen to it** — and real
> coaching arrangements are made almost entirely of things happening to them.
>
> **Pause is a column, not a `status` value, and that is the load-bearing
> decision.** `status` stays `active` for a paused pack: it is still the client's
> current arrangement, still what a renewal continues from, still what the money
> book is owed against. Folding it into `status` would make every existing
> `WHERE status = 'active'` read — the deck, the money book, `markDone`'s pack
> picker, `pack.active_clients` — silently drop a client who is on holiday. The
> single thing it gates is the charge: `markDone` will not decrement a pack with
> `paused_at` set. Resuming pushes `end_date` out by exactly the days lost.
>
> **The lifecycle sweep runs on read.** Nothing in the product ever moved a
> package off `active`, so a twelve-session block finished in March was still
> `active` in August. Every read of the package routes now closes what has quietly
> finished — `completed` when the sessions ran out, `expired` when the validity
> lapsed with sessions still on it, exhaustion winning when both are true, and a
> paused pack never touched. On read rather than on a schedule because the fact is
> **derived** and the sweep only writes it down; a scheduler would be a second,
> laggier opinion, and this application has none.
>
> A caller that wants *packs with money on them* must ask `amount_due > 0`, not
> `status = 'active'` — a client can finish all twelve sessions and still owe for
> four of them.

### 3.10 `payment` (single, dual-mode; append-only)
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | |
| package_id | uuid (FK→package) | yes | |
| amount | numeric(12,2) | yes | nullable (gym-collected may be a paid flag only) |
| currency | varchar | no | default `INR` |
| method | varchar | no | `upi` \| `cash` \| `bank` \| `front_office` (string). Free text by design — adding a mode is a code change, never a migration |
| collected_by | varchar | no | `trainer` \| `gym` (**captures the dual mode**) |
| status | varchar | no | `pending` \| `confirmed` |
| upi_ref | varchar | yes | optional reference the trainer/client enters |
| confirmed_by | varchar | yes | `trainer` \| `client` |
| paid_at | timestamptz | yes | **when the money arrived, and the only thing that says it has.** See below |
| note | text | yes | **V11** · "he paid the rest in cash on Tuesday". Free text, never parsed |

> ### `paid_at` is the settlement date, and `created_at` is the billing date
>
> Both are on this row and they answer different questions, which is why neither
> can be dropped in favour of the other. `GET /v1/payments` windows on
> **`created_at`** — a month's *billing* is what was raised that month, and
> dating an invoice by when it happened to be settled would move it into another
> month and drop every unpaid one, which is exactly what *still owed* is made of.
> The money book's six-month trend windows on **`paid_at`** instead, because "is
> my income going up" is a question about money that arrived. Same rows, two
> readings, and a screen that mixes them will produce two totals that are both
> right and do not agree.
>
> `POST /v1/packages/{id}/payments` takes `paidAt` and writes `status = 'paid'`
> when it is given, which is what lets cash and a gym counter's slip — money that
> is already settled by the time anyone types it — be recorded in one call rather
> than a POST and a `PATCH /confirm`. Omitted, the row is `pending`, which is
> right for a UPI intent fired at a client who has not paid yet. It is clamped to
> now: back-dating is the point, forward-dating is a payment that has not
> happened.

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
| message | text | yes | **V32.** The sentence that was actually drafted |
| sent_at | timestamptz | yes | |

> **`message` exists because the wording became the trainer's.** V1 recorded THAT
> a nudge happened and never what it said, which was enough while the sentences
> were constants in `NudgeService` — the template name plus the code
> reconstructed them. It stops being enough once a trainer can edit a template:
> the client file's follow-up history has to show what was sent, and re-rendering
> March's reminder in August's words would put a sentence in the history that was
> never sent. Nullable, because every row that already exists has no answer and
> an absence a reader can see beats an invention.
>
> **Readable over REST since V32** — `GET /v1/nudges` and
> `GET /v1/clients/{id}/nudges`. Until then this table reached the wire only
> inside the sync envelope, which is why the once-per-client-per-7-days cooldown
> was a rule only the phone could keep.

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

### 3.14 `client_note` (V29)
| Column | Type | Null | Notes |
|---|---|---|---|
| client_id | uuid (FK→client) | no | who the note is about |
| trainer_id | uuid (FK→trainer) | no | who **wrote** it, and the privacy rule — see below |
| body | text | no | free text; **no medical fields** |
| pinned | boolean | no | default false; a pinned note is drawn in the always-visible strip at the top of the client's file rather than in the notes list |

> The relationship layer — "prefers mornings, hates burpees, wife Priya, getting
> married in Nov". None of that fits `client.goal`, and it is what a trainer
> carries in their head about forty people.
>
> **`trainer_id` is the privacy rule, not bookkeeping.** A team widens reads over a
> teammate's client (V26) and must not widen this, for the same reason no role sees
> a teammate's money book. Every read narrows by the author, so a coach holding a
> client somebody else wrote notes on gets an empty list — not a refusal.
>
> **Free text and a pin, and it must stay that way.** There is no injury column, no
> condition column and no PAR-Q flag, and adding one would make this a health
> record whatever it was called — see §5. Plain text today; encryption at rest is
> the deployment's job (NFR-8) and does not need this shape to differ.
>
> Not in the sync envelope. REST only, per V26's and V28's argument: the web is
> online-only, and the phone will read these over REST when it adopts them.

### 3.15 `package_adjustment` (V30, append-only)
| Column | Type | Null | Notes |
|---|---|---|---|
| package_id | uuid (FK→package) | no | |
| trainer_id | uuid (FK→trainer) | no | denormalised, as V29's author is — see below |
| kind | varchar | no | `pause` \| `resume` \| `extend` (validated in code, per V19's note) |
| days | int | no | **signed.** `extend` → the goodwill given; `resume` → the days the pause cost and gave back; `pause` → `0`, an open pause has no length yet |
| reason | text | yes | "Kerala till the 20th." "Rough month, on me." Free text, never parsed |
| effective_at | timestamptz | no | when it took effect, which is not always when it was recorded |

> **Why a table and not two more columns.** The columns on `package` answer *what
> is true now*; this answers *how it got that way*, and only the second survives a
> disagreement. A client looking at a December expiry on a pack they bought in
> September wants to know why; a trainer who gave away a fortnight in July wants
> to remember before giving away another in August. Same argument V11 made for
> `gym_settlement.sessions_counted` — a figure you cannot show the working for is
> a figure the other party has to take on trust.
>
> It is also what keeps goodwill from being invisible. An extension is the
> cheapest thing a trainer gives away and the easiest to forget giving.
>
> **Append-only.** No UPDATE, no soft delete, no `deleted_at` — a pause that
> happened happened, and a log that can be edited is not a log. Reversing an
> adjustment is another row, which is why `days` is signed.
>
> **`effective_at` is separate from `created_at` because trainers catch up on
> Sundays.** A pause back-dated to the Thursday the client actually left gives back
> the right number of days on resume; one stamped when it was typed gives back
> three too few.
>
> `trainer_id` is denormalised for V29's reason: it makes "mine and nobody else's"
> a predicate the query can state rather than a join it has to be trusted to
> remember. A team widens reads and never widens the money book.
>
> Not in the sync envelope, per V26's, V28's and V29's argument: the web is
> online-only, and the phone will read these over REST if it adopts them. The three
> V30 columns on `package` are likewise absent from `pushPackages`' upsert, so an
> old build's push cannot touch them.

---

### 3.16 `nudge_template` (V32)
| Column | Type | Null | Notes |
|---|---|---|---|
| trainer_id | uuid (FK→trainer) | no | whose wording it is |
| name | varchar(50) | no | the template name the nudge endpoint speaks — `renewal`, `payment_reminder`, `missed_session`, `well_done`, `session_summary`, `re_engagement`, `check_in`, `session_reminder`. Unique per trainer |
| body | text | no | the message, with `{name}`, `{count}`, `{nth}`, `{amount}`, `{package}`, `{days}` and `{trainer}` substituted at send time |

> The trainer's own wording for each nudge, and **an OVERRIDE table rather than a
> seeded one**: a trainer who has never opened the library has no rows at all and
> gets `NudgeTemplateCatalog`'s built-in sentence. Seeding eight rows per trainer
> would freeze today's copy into every account, so improving a default would reach
> nobody who had ever signed up — and reset is a soft delete for the same reason,
> putting them back on the live default rather than on a copy of it.
>
> **Not `nudge_rule.message`, and the distinction is the point.** `nudge_rule`
> (V12) is one row per trainer per KIND — `quiet`, `pack_low`, `overdue`,
> `well_done`, `birthday` — and answers *when should a nudge be raised, and should
> it go automatically*: a threshold, an action, an enabled flag. This answers *what
> does the message say*, keyed by template name, and covers three templates that
> have no rule and never will (nothing schedules a post-session summary). Writing
> template names into `nudge_rule.kind` would put rows the phone's rule editor
> cannot label into a table it iterates.
>
> The honest cost, stated rather than hidden: a trainer who edits a rule's draft on
> the phone and the same template's body on the web has two strings. They do not
> fight — the phone's automation reads its rule, REST reads this table — and
> closing the overlap means the phone adopting this table, in a commit that moves
> both halves.
>
> Not in the sync envelope. REST only, per V26's, V28's, V29's and V30's argument.


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

**Add health-issue notes (when DPDP-ready):** create a new `health_note` table with its own access controls and consent, `client_id` FK. Kept out of `client` precisely so sensitive data is isolated and addable later. **And out of `client_note` (§3.14) for the same reason** — that table is the trainer's own free text with no consent story behind it, so widening it with an injury or condition field would put health data in a table that was never designed to hold it. A trainer typing "left knee — no deep squats" into a free-text note is doing what they would do on a paper card; a field that tells that note apart from any other note is the line this must not cross.

**Add a new payment method (e.g. a gateway):** add `razorpay` to the allowed values of `payment.method` (a code change) and, if needed, a nullable `gateway_txn_id` column. Old payments and old clients keep working.

**Add a new nudge channel (SMS):** add `sms` to `nudge_log.channel`'s allowed values. No schema change.

**Add a ninth nudge template:** add it to `NudgeTemplateCatalog` in code. `name`
is a plain string in `nudge_template` for exactly this reason — a ninth template
costs a deploy, not a migration, and it appears in the library screen without a
web deploy because the labels and variables come down on the wire.

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
