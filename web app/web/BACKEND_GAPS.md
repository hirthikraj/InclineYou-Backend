# Web app — backend REST gaps

Running list of fields and endpoints the web app needs but the current REST API does
not expose. Each entry names the screen, the gap, what the backend change looks like,
and what the web will do once it lands.

**Rule**: this file is the input for each backend-update pass. When a gap is resolved,
move it to the **Resolved** section at the bottom with the migration / PR that closed it.
Do not delete resolved entries — they record why the field exists.

---

## Open

**None.** Every entry that was open on 28 Aug 2026 was closed in one REST pass,
the four the program builder found on 29 Aug were closed in a second (V31), the
money book's three were closed in a third the same day — that one needed no
migration at all — and the nudge feature's three were closed in a fourth (V32).
All recorded below.

One thing deliberately **not** built, so it is not mistaken for an oversight:
**expenses**. The brief marks gym rent, equipment and certifications as *optional,
v1.5*, and they are the only part of the money screen with no table behind them —
`payment` is a client paying a trainer and has a `client_id`, a package and a
receipt, which is the same argument V11 used when it gave `gym_settlement` its own
table rather than a `direction` flag. An expense needs its own table, and a real
net-income figure needs it first.

When the next gap turns up, put it here in the shape the entries below use —
screen, design frame, what is missing, why the web needs it, what the web does
today, the backend change, the web change once it lands, and whether it is
additive.

---

## Resolved — nudges, 29 Aug 2026 · V32

Three gaps, one migration, and the shape of all three is the same: a table the
phone has read and written since the drawer was designed, which REST had never
exposed. The web could WRITE a nudge and could not read one back.

### `nudge_log` was write-only — **so the cooldown was a promise only the phone kept**

`lib/today/actions.ts` recorded this in its own docstring: `COOLDOWN_DAYS` in
`app/src/nudges/rules.ts` — "never twice in seven days to the same person" — is
computed **on the phone** from the local `nudge_log`, and `nudge_log` reached the
wire only inside the sync envelope. So a reminder sent from a laptop was
invisible to the phone's cap, a reminder sent from the phone was invisible to the
web, and the web honoured nothing.

It also cost the brief's second half outright: *"log what was sent, so the Today
screen doesn't re-nag about a client the trainer contacted yesterday, and so the
client timeline shows the follow-up history."* Neither was buildable.

**Backend:** `GET /v1/nudges?days&limit` (trainer-wide, defaulting to the
seven-day cooldown window) and `GET /v1/clients/{id}/nudges?days&limit` (one
client, defaulting to a year). Both `STANDARD` tier — `RateLimitFilter` tiers on
`POST` + a path ending `/nudge`, so a GET falls through, which is right: reading
the history spends no WhatsApp, and one dashboard load must not cost the trainer
one of the ten messages a minute they are allowed to send.

**Web:** `/today` reads the roster's week as a tenth request and `deck.ts` pushes
a contacted client's row below every uncontacted one — so the queue stops
re-nagging without hiding anything, and the row says *messaged 2 days ago* when
the fold is opened. The client file draws a *Follow-ups* card. **The cap is still
not enforced server-side and that is now a decision rather than a gap**: a
trainer pressing *Remind* on somebody they messaged on Monday knows something the
product does not, and a 429 teaches them to open WhatsApp directly — which loses
the log for every client rather than enforcing the cap for one.

**Additive.**

### `nudge_log` recorded THAT a message happened, never what it said

Enough while the wording was a constant in `NudgeService`: the template name plus
the code reconstructed the sentence. It stops being enough the moment the trainer
owns the wording — the follow-up history has to show what was actually sent, and
a trainer who edits a template must not have last month's messages silently
re-rendered in this month's words.

**Backend:** `nudge_log.message TEXT`, nullable, written on every send and
returned by both reads. Nullable because every row that already exists has no
answer and inventing one is worse than an absence the reader can see — the web
draws *"Sent before XRep started keeping the wording."*

**Additive**, plus two partial indexes: the V1 indexes are on `trainer_id` and
`client_id` separately, which makes the per-client read a scan of everything that
client has been sent by anybody.

### There was nowhere to keep a trainer's own wording

The brief asks for an editable template library with variables. `NudgeService`
hard-coded six sentences in a `switch`.

**Backend:** `nudge_template` — one row per trainer per template name, holding an
**override** of the built-in. `GET`/`PUT`/`DELETE /v1/nudge-templates`, plus
`NudgeTemplateCatalog`, which holds the eight names, their defaults, their labels
and their variable lists in one place. Two new templates arrived with it:
`session_summary` and `re_engagement`.

**An override table and not a seeded one**, which is the decision worth keeping:
seeding eight rows per trainer on signup freezes today's copy into every account,
so improving a default sentence would reach nobody who had ever signed up.
Resetting is a soft delete for the same reason — it puts the trainer back on the
LIVE default, not on a copy of whatever it was the day they joined.

**Why not `nudge_rule.message`,** which has existed since V12 and already
substitutes `{name}`/`{days}`/`{amount}`: that table is one row per trainer per
KIND (`quiet`, `pack_low`, `overdue`, `well_done`, `birthday`), the phone's
`NudgeRulesScreen` iterates it and renders those five, and it answers *when
should a nudge be raised, and should it go automatically*. Writing template names
into its `kind` would put rows that editor cannot label into a table it walks —
a regression to `app/` caused by a write on this half. The overlap is stated in
V32's own comment: closing it means the phone adopting `nudge_template`, in a
commit that moves both halves.

**Additive**, and not in sync — per V26's, V28's, V29's and V30's precedent.

### And one thing this pass did NOT ask the backend for

**Scheduled and automatic nudges.** They need the WhatsApp Business API, which
needs money, Meta's template review and a trust tier — and, the part that
actually decides it, sends from a platform number. A message from the trainer's
own number lands in a thread the client already has open; one from a business
number lands beside the delivery notifications. Automation would make this feature
worse, not better. It is v2, and `nudge_rule.action = 'auto'` is the column that
is already waiting for it.

---

## Resolved — the money book, 29 Aug 2026 · no migration

Three entries and **not one of them needed a schema change**, which is the
finding worth keeping. Every column was already there — V11 added `payment.note`
and V1 added `paid_at` — and the sync envelope has carried both since. REST
simply never selected or wrote them, so a field that existed on the phone was
invisible to the web and a form on the web had nowhere to put one.

### `/business` · Ledger — **a recorded payment could never be collected**

`POST /v1/packages/{packageId}/payments` wrote every row `status = 'pending'`,
full stop, and the only thing that could move one was
`PATCH /v1/payments/{id}/confirm` — which no web screen calls and which has no
button anywhere in this app. So the record panel, whose entire job is *money
changed hands*, recorded a **debt**: the ledger's *Collected* never moved,
*Still owed* grew by the amount just handed over, and the client showed as owing
money they had paid in cash while the trainer watched.

That is right for exactly one case, a UPI intent fired optimistically at someone
who has not paid yet, and wrong for the two commonest — cash, and a slip from the
gym's counter. Both are settled before anyone types them.

**Backend:** `CreatePaymentRequest` takes an optional `paidAt` (epoch ms). Given,
the row is written `'paid'` with `paid_at` stamped to it and the gym's cut
stamped in the same statement, by the rule `confirmPayment` already applied —
which is now a shared `gymSplitFor` helper rather than two copies of the
arithmetic. Omitted, nothing changes. Clamped to now, never rejected.

**Web:** the record panel sends the date and defaults it to today. The *money has
not arrived yet* checkbox is the opt-in back to a pending row, and it is offered
only against UPI and bank, since cash cannot be outstanding.

**Additive**, and it is also what makes the *date* field the brief asks for mean
something: `paid_at` is what the six-month trend buckets on.

### `/business` · Ledger — `payment.note` was write-only, from the phone

V11 added the column for "he paid the rest in cash on Tuesday" and `pushPayments`
has upserted it since. `PAYMENT_COLUMNS` never selected it and
`CreatePaymentRequest` had no field for it, so REST could neither read a note the
phone had written nor write one of its own. The record panel's only free-text
field was a *UPI reference*, drawn on UPI alone.

**Backend:** `note` appended to `PaymentResponse` (after `gymShareAmount`, the
additive-only position) and to `CreatePaymentRequest`; `PAYMENT_COLUMNS` selects
it. **Web:** a note field on every method, and the note drawn under the *How*
cell in the ledger and carried into the CSV export.

### `/business` · Ledger — `upiReference` was sent on create and silently dropped

The record panel has always sent `upiReference` in the create body.
`createPayment` never read it: only `confirm` wrote that column, so a reference
typed into the form went nowhere, and the row that most wanted one — a UPI
payment being recorded as already settled — never got one.

**Backend:** written at record time. `confirm` now `COALESCE`s onto the column
rather than assigning it, so confirming a payment that carries no reference no
longer erases the one recorded with it. **Additive**, and it fixes an erase.

---

## Resolved — the program builder, 29 Aug 2026 · V31

Five entries. Four of them are the same shape as the pass below — a column that
existed and a DTO that had no field for it — and the fifth is a wire bug rather
than a gap: the endpoint answered, and answered in the wrong casing.

### `/programs` — the builder

#### 9 · `GET /v1/templates` answered with the STORAGE spelling

| | |
|---|---|
| **Screen** | `/programs`, `/programs/:id` |
| **What was wrong** | `TemplateResponse.exercises` was `List<Map<String,Object>>` handed straight out of the `template.structure` jsonb, so the wire carried `exercise_id`, `day_of_week`, `rest_seconds`, `order_index`. `API.md` had documented `exerciseId` since the endpoint existed. |
| **What it cost** | The web app is the only REST consumer, and it read every field as `undefined`: every template on the shelf drew as **"0 days a week", "1 wk", with no exercises in it**, and `getDays` found nothing to lay out. Not a subtle wrong number — the screen was empty and had been since it was written. |
| **Why it survived** | It typechecks on both sides. The Java side is a `Map`, which serialises whatever keys it holds; the TypeScript side declares an interface the JSON never has to satisfy. Nothing on either half can catch it, and the only thing that does is looking at the screen. |
| **Backend change** | A typed `TemplateExerciseResponse` record in camelCase, and a parser that reads BOTH spellings out of storage — snake_case is what this service, the sync push and the phone's `parseBlueprint` all write, and camelCase turns up because the column is free JSON several builds have written. |
| **Additive?** | The wire changes spelling, which is normally forbidden. It is allowed here because the documented contract was always camelCase, the implementation was leaking a storage detail, and the one consumer was broken by it. **The storage format is untouched**, so no phone build notices. |

#### 10 · `week` and `durationSeconds` had no field on `TemplateExerciseInput`

The columns have been in the blueprint JSON since V20 and V25, the phone reads
both, and `apply` has always copied both — but the request record had no fields
for them, so Jackson dropped them on every `POST` and `PUT`.

**A multi-week template could not be authored over REST at all**: every entry
came back as week 1 however it was sent, which makes Program → Week → Day
unbuildable. Closed by adding both fields.

#### 11 · `weeks` and `trainingDays` were readable and unwritable

Same story on the template row itself. `template.weeks` (V20) and
`template.training_days` (V24) travel in the sync envelope and neither
`CreateTemplateRequest` nor `UpdateTemplateRequest` had a field, so every
web-authored template wrote NULL to both.

That is not cosmetic: without `training_days` the day list has to be inferred
from wherever exercises landed, and the design set names the trap — the first
exercise goes on Day 1, Day 1 becomes the only day the program has, and there is
nowhere left to put Day 2's first exercise. **A day exists when the trainer lays
it out, not when something lands on it.**

#### 12 · Nothing could count "9 clients on this", and nothing could list them

`GET /v1/templates` had no assignment count and there was no way to ask which
clients were on a copy of a blueprint. Both are what the shelf row is chosen by
and what makes an edit feel safe or dangerous.

Closed by `assignedCount` / `activeAssignedCount` on `TemplateResponse`, counted
in SQL over `program.template_id`, and `GET /v1/templates/{id}/assignments`.

#### 13 · A template edit could never reach a client who was already on it

`apply` snapshots, correctly — that is what the two tables are for. What was
missing was the deliberate override: no route re-copied a blueprint onto an
existing program, so a trainer who fixed a typo in a blueprint had to delete and
re-assign nine clients, re-choosing every weekday and time.

Closed by `POST /v1/programs/{id}/resync`, which keeps the client's own schedule
and refuses rather than inventing a weekday for a day the blueprint has grown
since. See `API.md`.

#### 14 · V31's own four columns

`tempo`, `alt_exercise_id`, `group_id` and `set_detail` on `program_exercise`.
All four already had somewhere to live on the template side — `structure` is
jsonb — and nowhere on the CLIENT'S copy, because `program_exercise` is fixed
columns and `apply` copies column by column. A superset authored on a blueprint
would have been silently flattened the moment it was assigned to somebody, which
is the worst available failure: the trainer sees it and the client never gets it.

**And one that was found by reading the response, not the code:** `?ids=` on
`GET /v1/exercises` answers in the SEARCH route's envelope — `{exercises, total}`
— because it is a filter on that route rather than a route of its own. Reading it
as a bare array is a 200 that throws on the spread, and it was the first thing
that happened when this screen was pointed at a real backend.
`lib/sessions/api.ts` had already unwrapped it correctly; `lib/programs/api.ts`
had not, and now says so.

---

## Resolved — the REST pass of 28 Aug 2026

Seven entries, no migration between them: every column these needed already
existed and had been travelling in the sync envelope, sometimes since V12. What
was missing was a REST route or a field on a DTO, which is the shape of gap an
offline-first product grows when its second half is online-only.

Two of the changes are behaviour changes rather than additions, and both are
called out where they sit: `PUT /v1/workouts/{id}` stopped writing `notes`
unconditionally, and `PUT /v1/sessions/{id}` can now move a pack. Everything
else is additive under the schema law — a new field appended last, a new
optional request field, a new optional query parameter, or a new route.

### `/clients` — Roster

#### 1 · `membershipStatus` missing from `GET /v1/clients`

| | |
|---|---|
| **Screen** | `/clients` roster table |
| **Design frame** | `webapp-clients.html` frame 1a, row class `alert`, action "Fix number" |
| **What is missing** | `ClientResponse` (Java record in `ClientService`) does not include `membershipStatus` from the `client` table. The field exists in the database and travels in the WatermelonDB sync envelope, but `GET /v1/clients` omits it. |
| **Why the web needs it** | `lib/clients/roster.ts` port omits the `unavailable` attention band because the field is absent. The band fires when a trainer adds a phone number that belongs to a trainer account — the invite can never reach them. Without the field the "Fix number" action never appears on the web roster. |
| **Backend change** | Add `membershipStatus` to `ClientService.ClientResponse`: <br>`String membershipStatus,` <br>Populate it from `client.membership_status` in `ClientService.toResponse()`. This is an additive field — no existing consumer breaks. |
| **Web change once landed** | In `lib/clients/api.ts`, add `membershipStatus: string \| null` to `ClientWire`. In `lib/clients/roster.ts`, re-add the `unavailable` candidate block (commented out with `// BACKEND_GAP:unavailable` as a locator): <br>```typescript<br>// BACKEND_GAP:unavailable — restore when membershipStatus is in ClientWire<br>// if (lower(client.membershipStatus ?? '') === 'unavailable') {<br>//   candidates.push({ band: 'unavailable', kind: 'unavailable', ... });<br>// }<br>``` |
| **Additive?** | Yes — field added to an existing response, no existing field removed or renamed. Follows the schema law. |


**Closed.** `membershipStatus` is on `ClientService.ClientResponse`, appended
last, populated from `client.membership_status` and reaching both `GET
/v1/clients` and `GET /v1/clients/{id}`. No migration — the column has been
there since V18. `RosterFieldsTest` holds the three facts the band depends on:
the field reaches the list, it reaches the file, and a row written before
consent existed still reads `accepted` rather than empty.

**Consumed.** `ClientWire` carries the field, the `BACKEND_GAP:unavailable`
block in `lib/clients/roster.ts` is live code again, and `AttentionKind` gained
`'unavailable'` to match the mobile file's. The band ranks first, above money,
for the reason the mobile file gives: every other attention item became true over
time, this one is a typo made seconds ago and fixable in seconds.

---

### `/sessions/:id/log` — Workout console

#### 3 · No bulk set-log read — a client's history costs one request per session

| | |
|---|---|
| **Screen** | `/sessions/:id/log` (frame 1a), `/clients/:id/exercises/:exerciseId` (4a), `/clients/:id/progress` (4b) |
| **Design frame** | `webapp-workout.html` §03, §04, §07 |
| **What is missing** | `GET /v1/workouts/{id}/sets` is the only way to read set logs, and it is per workout session. The console needs **every set this client has ever done on the exercises in today's grid** — Previous is per set number against the last session, and the record test compares today's top set against the heaviest load in the whole history. A client at three sessions a week for a year is ~150 HTTP requests for one page load, against the 120/min STANDARD tier. |
| **Why the web needs it** | The phone holds the whole table in SQLite and does this with a `SELECT`. This half holds nothing. |
| **What the web does today** | `lib/log/api.ts` reads a **window** of the client's most recent sessions (`HISTORY_SESSIONS = 40`, `HISTORY_SESSIONS_DEEP = 60`) through a six-at-a-time pool, and takes the all-time maximum load per exercise from `GET /v1/clients/{id}/progress` so `judge` still has a true floor for test 2. Two holes remain and both are narrow: `/progress` is `LIMIT 30` exercises and counts only sets that carry a load, so a client with more than thirty movements, or a reps-only exercise with more than forty logged sessions, can have an old best outside both. |
| **Backend change** | `GET /v1/workouts/sets?clientId=…&exerciseId=…` returning `SetLogResponse[]` joined through `workout_session` on the trainer's own clients, with `session_date` appended to each row so the caller does not need the workout list to order them. Additive: a new route, no existing response changed. |
| **Web change once landed** | Replace `setsFor(recent.map(...))` in `lib/log/api.ts` with one call, delete `HISTORY_SESSIONS`, and drop the `bestLoadByExercise` floor from `LogInput` — `judge` would then see the real history and the floor's two holes close with it. |
| **Additive?** | Yes. |


**Closed** by `GET /v1/workouts/sets?clientId=…&exerciseId=…`, which returns
`SetLogResponse[]` for one client across every session, oldest first, optionally
narrowed to one exercise. Ownership is the join on `workout_session.trainer_id`,
so another trainer's client comes back empty rather than 403.

`sessionDate` is appended to `SetLogResponse` on **both** set routes — the
session's date, never the row's `created_at`, because a Tuesday session typed up
on Thursday is a Tuesday session and both *Previous* and the record test order
by when the training happened.

Deliberately unbounded. A window is what produced the wrong answer, and this is
the online half's equivalent of the `SELECT` the phone runs against SQLite.

**Consumed.** `setsForClient` in `lib/log/api.ts` is one call;
`HISTORY_SESSIONS`, `HISTORY_SESSIONS_DEEP` and `bestLoads` are deleted, and
`bestLoadByExercise` is off `LogInput` entirely — `judge` lost its fifth argument
with it, so there is no second opinion left to disagree with the history. Both of
the floor's holes close by removing it. Frames 4a and 7a pass `exerciseId` and
narrow on the wire.

The pool and the per-session read survive for **one** caller and are documented
as such: frame 5a's picker wants the open logs across *every* client, and
`?clientId=` is per client.

#### 4 · A log cannot be closed — `endedAt` has no write

| | |
|---|---|
| **Screen** | `/sessions/:id/log` header (*Finish the log*), `/sessions/:id/finish` |
| **Design frame** | `webapp-workout.html` frames 1a and 5b |
| **What is missing** | `endedAt` is on `WorkoutSessionResponse` (V13's column) and **`PUT /v1/workouts/{id}` writes `notes` and nothing else** — `WorkoutSessionService.update` is a one-column `UPDATE`. So nothing on the wire can stamp the moment the trainer closed the log. |
| **Why it matters** | `buildRunning` on both halves decides *in session* by finding a scheduled session whose log has not ended. A log that can never be closed reads as permanently open, so Today says **In session** for a session logged on Tuesday — which is the exact defect `API.md` records the field being added to fix, now reachable from the other end. It is also what makes *Later* honest: finishing the log and closing the money are different facts. |
| **What the web does today** | *Finish the log* navigates to `/sessions/:id/finish` rather than closing anything, and the finish screen's minute figure counts from `createdAt` to now while the log is open. `POST /v1/sessions/{id}/done` is the only thing that ends a session, and it ends the money side rather than the log. |
| **Backend change** | Accept `endedAt` (epoch ms, nullable) on `UpdateSessionRequest` and write it in the same `UPDATE`. Appended to the request record, so existing callers are unaffected. |
| **Web change once landed** | `saveWorkoutNotes` in `lib/log/actions.ts` grows a `closeLog` sibling; the console's *Finish the log* calls it before navigating, and the finish screen's `span` stops being null. |
| **Additive?** | Yes — a new optional request field. |


**Closed.** `UpdateSessionRequest` takes `endedAt` (epoch ms) and `PUT
/v1/workouts/{id}` writes it in the same `UPDATE`. Three states: absent leaves
`ended_at` alone, `> 0` closes, `0` reopens — the last because with null already
meaning "don't touch", an additive-only API that never adds a way back makes
mis-tapping *Finish the log* permanent.

**One behaviour change came with it, and it had to.** `notes` used to be written
unconditionally, so a request carrying only `endedAt` would have set it to
`NULL` — closing a log would have erased the session's notes, which is the exact
trap `closeLogs` in `lib/today/actions.ts` documents about the sync upsert. Both
fields are now conditional. Nothing clears notes by sending null; an empty
string is non-null and still clears. `WorkoutLogRestTest` pins both directions.

**Consumed.** `closeLog` sits alongside `saveWorkoutNotes`, and *Finish the log*
is a `<FinishLog>` button rather than a `<Link>` — shared by the console and
frame 2a so two buttons with the same words cannot drift into doing different
things. It does not wait for the write before navigating, for the reason `Renew`
does not.

`closeLogs` on Today is off the sync envelope: `WorkoutRowWire` went from nine
fields to two, because the read is now only there to tell an open log from one
the phone closed between render and click. `call` in `lib/today/actions.ts` took
a `method` argument to allow the PUT.

#### 5 · `exercise.log_type` is not on `ExerciseResponse`

| | |
|---|---|
| **Screen** | `/sessions/:id/log`, frame 1d — an exercise that carries no load |
| **Design frame** | `webapp-workout.html` frame 1d, and §14's first row |
| **What is missing** | The column has existed since V12 (`V12__drawer.sql`) and travels in the sync envelope. `ExerciseService.ExerciseResponse` does not carry it. |
| **Why the web needs it** | It decides whether the grid draws a load field or the words *— no load*, and whether `judge` runs its reps branch (where there is no plate step, so every real record is a loud one). |
| **What the web does today** | `readLogType` in `lib/log/log.ts` infers: the client's own sets win — an exercise logged with a load is a weight exercise whatever the library says, which is right for a chin-up done in a dip belt — and `equipment` is the tie-breaker for a first log. It is a good guess and it is a guess. |
| **Backend change** | Add `String logType` to `ExerciseResponse`, populated from `exercise.log_type`. Append it last. |
| **Web change once landed** | `ExerciseWire` in `lib/log/api.ts` gains the field and `readLogType`'s first branch starts firing; the inference stays as the fallback for null rows. |
| **Additive?** | Yes. |
| **Note** | §14 of the design also owes `LogType` two more members — `time` and `distance` — so a plank and a farmer's walk can be logged as what they are. That is a change on the phone as well and is not this file's. |


**Closed.** `logType` is on `ExerciseResponse`, appended last, and it comes back
as stored — null on the seeded rows, which is what V12 left them as and what
'weight_reps' means. The reading stays the caller's, so `readLogType`'s
inference is still the right fallback for a null row.

**`CreateExerciseRequest` gained it too**, which the original entry did not ask
for and the feature is incomplete without: without it a custom exercise created
over REST could only ever be a weight exercise, so the web could not add a
chin-up — something the phone has done since V12. Null defaults to
`weight_reps`, matching the sync push's own default so two writers of one column
cannot disagree. Set once at creation and never updated, per V12.

**Consumed.** `ExerciseWire` carries `logType` and `readLogType` now answers
from the library FIRST — which is the only branch that can answer for an exercise
nobody has logged yet, and that was the case the inference could never reach: a
first chin-up drew a load field and asked for a number that does not exist. The
client's own sets still override a null column, because a chin-up done in a dip
belt is a weight exercise whatever the library says.

§14's other two members — `time` and `distance`, so a plank and a farmer's walk
can be logged as what they are — are still not this file's, and are still a
change on the phone as well.

#### 6 · A no-show cannot move the pack, and a pack cannot be edited at all

| | |
|---|---|
| **Screen** | `/sessions/:id/finish` — frame 5c, *they didn't train* |
| **Design frame** | `webapp-workout.html` frame 5c |
| **What is missing** | `POST /v1/sessions/{id}/done` is the only endpoint that touches `package.sessions_remaining`. `PUT /v1/sessions/{id}` with `status: 'no_show'` writes the status only, and `PackageController` has no `PUT`/`PATCH` at all — so nothing can decrement a pack outside marking a session done. |
| **The disagreement** | The design says *"a no-show costs a session"* and calls it the single difference between the three outcomes. The code says otherwise, and `lib/schedule/actions.ts` states the code's position as a decision rather than an omission: whether it burns a session is a commercial decision the trainer makes with the client. §14 of the design settles which wins — *where a document disagrees with the code, the code wins*. |
| **What the web does today** | `components/log/Finish.tsx`'s `NotTrained` draws all three outcomes and says what each one actually writes, with the pack sentence pointing at the money book. The design's copy is not used, and the reason is in the component's docstring so nobody "fixes" it back. |
| **Backend change** | Either (a) a `packDelta` option on `PUT /v1/sessions/{id}` when the status becomes `no_show`, stamped through the same `pack_delta` / `pack_package_id` / `pack_applied_at` columns `markDone` uses so the 24-hour undo works identically; or (b) `PATCH /v1/packages/{id}` with `sessionsRemaining`, which is the more general answer and the more dangerous one. (a) is the one this screen wants. |
| **Web change once landed** | The no-show row's `.scp__n` becomes **−1 session** and the closing paragraph loses its last sentence. Both halves' copy has to change in the same commit — the diary draws this sentence too. |
| **Additive?** | Yes for (a) — a new optional request field. |


**Now fully closed.** The editing half went with V30 (recorded below); the
no-show half is closed here, by option **(a)** exactly as the entry asked:
`packDelta` on `PUT /v1/sessions/{id}`, `-1` or `0`, stamped through the same
`pack_delta` / `pack_package_id` / `pack_applied_at` columns `markDone` uses, so
the 24-hour undo reverses a session settled here as exactly as one settled on
the device. Option (b) remains deliberately unbuilt.

**The disagreement is settled the way the entry framed it, not the way the
design did.** It is a request field rather than a rule the server applies to
`no_show` on its own: whether a missed session burns one is a commercial
decision the trainer makes with the client. So `Finish.tsx`'s copy stays
correct, and its docstring still explains why — but the control it describes now
has somewhere to write to. Note the phone's `markNotTrained` has always charged
a no-show; the two halves can now express the same outcomes, which is what
matters.

The server's settlement is the phone's `settlePack`, quadrant for quadrant —
already charged and still should be (nothing moves, original stamp kept),
charged but shouldn't be (put back, capped at `sessions_total`), not charged and
should be (take one), not charged and shouldn't be (nothing moves). A paused
pack is not chargeable (V30), a `done` session is a 400 because `/done` owns
that outcome, and any delta but -1 or 0 is a 400. `packDelta` and
`packPackageId` are appended to `SessionResponse` so a caller can read back what
was taken — *Marked no-show* and *Marked no-show · pack −1* are different facts.
`NoShowPackTest` covers all four quadrants and both guards.

#### 7 · `workout_exercises` never reaches REST

| | |
|---|---|
| **Screen** | `/sessions/:id/log` — frames 3a (add an exercise) and 3b (swap, scope *today*) |
| **Design frame** | `webapp-workout.html` frames 3a, 3b |
| **What is missing** | The table is in the sync envelope (`POST /v1/sync/push` accepts it) and has no REST route. There is no way to say "this exercise is part of today's session" without logging a set against it, and no way to record `source: 'unplanned'`, `swapped_from_exercise_id`, a per-card `rest_seconds`, or a removal. |
| **What the web does today** | `buildRows` in `lib/log/log.ts` reconstructs the grid from the program's rows plus every exercise that has a set in this log. An exercise added on frame 3a lives in the URL (`?plus=`) until its first set is logged, which is honest on an online-only half — the card is a place to type and the type is the write — and it is why frame 3a's foot says *today's log only* and means it literally. Two consequences: a swap with scope *today* leaves the original in the grid with no sets rather than recording that it was replaced, and rest for an off-plan exercise has nowhere to persist, which the `.rst2` strip says out loud instead of offering a dead control. |
| **Backend change** | `GET`/`POST`/`PUT`/`DELETE` under `/v1/workouts/{id}/exercises`, mirroring the sync table's columns. |
| **Web change once landed** | `buildRows` keeps its shape and takes real rows instead of reconstructing them; `?plus=` goes; `swapExercise`'s `today` branch becomes a write; and the rest strip becomes editable for unplanned cards. |
| **Additive?** | Yes — new routes on an existing controller. |


**Closed** by `GET` / `POST` / `PUT` / `DELETE` under
`/v1/workouts/{id}/exercises`, mirroring the sync table's columns.

Two things worth knowing before the web consumes it:

- **`POST` is idempotent on the pair.** The table's unique index is partial —
  `(workout_session_id, exercise_id) WHERE deleted_at IS NULL` — so a second
  POST would otherwise be a 500. Adding an exercise that is already there,
  including one just removed, updates the row and clears `removedAt`, which is
  what "add it back" means to the trainer who clicked it.
- **`removedAt` and `DELETE` are different verbs**, as V13 intended. A removed
  card stays in the list to be drawn struck through with an Undo on it;
  `DELETE` tombstones a row that should never have existed.

`removedAt` takes the same three-state Long as `endedAt`: absent leaves it, `>
0` removes, `0` restores.

The web can now let `buildRows` take real rows instead of reconstructing them,
drop `?plus=`, make `swapExercise`'s `today` branch a write that records
`swappedFromExerciseId` — so a swap stops reading as a skip — and make the
`.rst2` rest strip editable for unplanned cards.

---

### `/sessions/:id` — Session detail

#### 8 · No way to read exercises by id — naming ten set logs costs the whole library

| | |
|---|---|
| **Screen** | `/sessions/:id` (upcoming and past), and every other screen that puts a name on a set log |
| **What is missing** | `GET /v1/exercises` takes `q`, `muscleGroup`, `bodyPart`, `target`, `equipment`, `level`, `page` and `size` — and no id filter. There is no `GET /v1/exercises/{id}` either. A session with six movements in it therefore costs the same request as a search across all ~1,300: `?size=2000`. |
| **Why the web needs it** | The phone holds the library in SQLite and joins locally. This half holds nothing, so every screen that shows a set log, a program row or a plan has to pull the whole table to turn six UUIDs into six names. It is one request rather than six, which is why it is a payload problem and not a rate-limit one — but it is the largest single response the web app asks for and it is asked for on load, on every one of those screens. |
| **What the web does today** | `allExercises()` in `lib/sessions/api.ts` and `lib/log/api.ts` each pull `?size=2000` once per render, wrapped in React `cache()` so one render never asks twice. It is only affordable because the library is text-only since V22 — the artwork was © Gym visual and unlicensed — so a row is a few hundred bytes rather than a GIF. |
| **Backend change** | `GET /v1/exercises?ids=a,b,c` returning only those rows, seeded library and the trainer's own customs alike, ignoring paging. Additive: a new optional query param on an existing route, no response field changed. |
| **Web change once landed** | `allExercises()` becomes `exercisesByIds(ids)` and takes the ids the caller already has — the plan's `exerciseId`s plus the set logs'. Nothing else on the page changes shape. |
| **Additive?** | Yes — a new optional query parameter. |

---

**Closed** by `GET /v1/exercises?ids=a,b,c` — a new optional query parameter on
the existing route, returning exactly those rows from the seeded library and the
trainer's own customs, and **ignoring paging**.

Three rules it keeps, each of which fails quietly if it doesn't: a malformed id
is a 400 rather than dropped from the filter (dropping it returns a shorter list
that looks complete and draws a blank where the exercise should be); an `ids`
that resolves to nothing returns nothing rather than falling through to the
whole library; and paging is ignored, because a `size=20` default keeping the
first twenty of thirty named ids is the same missing-name bug in another
costume. Over 600 ids is a 400 rather than a silent truncation.

**Consumed on `/sessions/:id`.** `lib/sessions/api.ts` has `exercisesByIds`,
keyed on a sorted CSV rather than the array — `cache()` memoises on argument
identity and a fresh array literal would turn the cache off silently. It cost one
structural change: the ids come from the plan's rows and the set logs, so the
exercise fetch moved out of the opening `Promise.all` and the set read was
hoisted out of the `if (workout)` block.

**Deliberately NOT consumed in `lib/log/api.ts`.** The console's add panel
(frame 3a) searches the whole library in the browser, so that page genuinely
wants all 1,324 rows and `?ids=` would not help it. `allExercises` stays there
and says why.

---

## Resolved earlier — the V30 / packs pass

### 2 · `GET /v1/packs` missing — trainer's price list not accessible via REST

**Closed** by `PackController` / `PackService` (added for `/business?tab=packages`)
and consumed on a second screen by V30's package work. The endpoint returns
`id`, `name`, `type`, `sessions`, `amount`, `currency`, `validityDays`, `status`,
`owner`, `orderIndex`, `activeClients`, and takes `?owner=` / `?status=`.

`lib/clients/client-api.ts` now reads `/v1/packs?owner=trainer&status=active`
alongside the client file, so *Sell a pack* on `/clients/:id/payments` offers real
prices instead of an empty form. The `/clients/new` step-2 selector this entry was
originally written for is still not built — the endpoint is no longer what is
stopping it.

### 6 (half) · a pack could not be edited at all

> **Superseded.** The other half — the no-show — was closed on 28 Aug 2026 by
> `packDelta` on `PUT /v1/sessions/{id}`. See entry 6 under *the REST pass of 28
> Aug 2026* above. The paragraph below is kept as written, because the reason
> option (b) was refused is still the reason it should stay refused.

**The half about editing is closed; the half about no-shows is not.**

`PackageController` had no `PUT`/`PATCH` and now has five POSTs — `renew`,
`pause`, `resume`, `extend`, and `GET .../adjustments` (V30). A pack's dates can
be moved, its clock stopped, and its terms repeated, and every one of those writes
a `package_adjustment` row.

**Option (b) in the original entry was deliberately not taken.** That entry called
`PATCH /v1/packages/{id}` with `sessionsRemaining` "the more general answer and
the more dangerous one", and it is: a route that sets a session count directly can
silently undo a charge the diary's 24-hour undo exists to reverse properly. The
five routes move dates and nothing else.

So **the no-show gap stood unchanged** — it wanted option (a), a `packDelta` on
`PUT /v1/sessions/{id}`, stamped through the same `pack_delta` / `pack_package_id`
/ `pack_applied_at` columns `markDone` uses. That is exactly what it got, three
days later and unchanged in shape. Nothing in V30 touched it.

---

## Closed by V30, and worth recording because the web changed with them

Not REST gaps in the original sense — these were defects the web was working
around, or working around wrongly.

### `payment.status` — the web read `'confirmed'`, the API writes `'paid'`

`PaymentsTab.tsx`, `OverviewTab.tsx` and `Header.tsx` each summed payments whose
`status === 'confirmed'`. `PackageService.confirmPayment` writes **`'paid'`**, so
none of them ever matched: **a client who had paid in full showed as owing every
rupee**, on the three surfaces a trainer opens to check exactly that.
`lib/money/compute.ts` had always taken both spellings, which is why the money book
and the client file disagreed about the same money.

Closed at the source: `amountPaid` / `amountDue` are now computed in SQL on
`PackageResponse` (counting both spellings, subtracting write-offs), and the three
components read them. The local sums survive only as a fallback for a pre-V30
backend, and they take both spellings now too.

### `gym_share_amount` was never stamped

API.md says the gym's split is stamped when a payment is confirmed. Nothing
stamped it — `confirmPayment`'s UPDATE wrote four columns and neither
`gym_share_amount` nor `share_percent` was among them. So the client file's *the
gym's share* row never rendered and *what you keep* showed the full billed amount
to a trainer who keeps half of it. Now written at confirmation, from the trainer's
percentage at that instant, `COALESCE`d so a re-confirmation cannot re-derive it.

### Nothing ever expired a package

No code anywhere wrote `status = 'completed'` or `'expired'`. A twelve-session
block finished in March was still `active` in August, so `GET /v1/packages?status=
active` was not a list of live packs, the deck counted arrangements that had ended,
and `pack.activeClients` was inflated by everyone who had finished. V30 sweeps on
read.

**One consequence the web had to absorb:** `RecordPanel` offered
`status === 'active'` packs, which would have broken the commonest debt in this
business — a client finishes all twelve sessions and still owes for four of them,
and their pack is now closed. It asks `amountDue > 0` instead, which is the right
question, and it seeds the *balance* rather than the sticker price.

### The web could not sell a package at all

`POST /v1/clients/{id}/packages` had exactly one caller — `renew()` in
`lib/today/actions.ts`, which needs a pack to already exist. Every *Sell a pack*
path was a loop ending at `RecordPanel`, which records a payment against a package
and answered "Sell one first" with nothing to click. `components/clients/file/
PackPanel.tsx` is the "first".
