# Backend API gaps: redesigned UI vs Spring (23 Sep 2026)

**Supersedes `BACKEND_GAPS.md`.** That covers both the 12 Sep port-day copy in this tree (`git show HEAD:BACKEND_GAPS.md`) and the mock repo's own `mock-ui/web/BACKEND_GAPS.md`, which the working tree now holds. Their *Resolved* sections are still the history of why each field exists. Do not delete them, but stop adding to them. This file is the input for the next backend pass.

**Baselines measured.**
- **UI spec:** the mock repo `InclineYou-MockUI` at `0975f18`. Its uncommitted edits (`components/business/Overview.tsx`, `app/styles/app.css`) touch no wire.
- **Backend:** `inclineyou/backend` working tree. It had migrations V1–V5 when this was written, and part of V2–V5 is still uncommitted. **The backend pass (below) has since landed V6–V20 (and rewrote the unshipped V5 to drop its sitting table), so the next free migration is V21.**
- **The web tree (`web app/web/`) is mid-port.** While this was being written, files were being overwritten from the mock, and `lib/assessments/cycle.ts`, `lib/clients/packs.ts` and `lib/programs/schedule.ts` disappeared. So it is read here only for what it relied on before the port.

**How to read it.**
- **Status:** **OK** means the route exists and the shape the UI reads matches the Java DTO. **SHAPE** means the route exists, but fields, params or behaviour differ; each entry lists the exact differences. **MISSING** means no controller mapping exists.
- **Priority:** **P0** blocks a v1 screen from rendering: the page's read throws, and the guard draws `Unavailable` or redirects. **P1** breaks a verb, or silently loses data. **P2** is degraded or cosmetic.
- **Paths:** mock paths are relative to `InclineYou-MockUI/mock-ui/web/`. Backend paths are relative to `inclineyou/backend/src/main/java/com/inclineyou/inclineyou_backend/` unless they start with `backend/`.
- **Mock behaviour:** "mock router" means `mock/router.ts`; the portal is `mock/portal.ts`. Where the mock disagrees with a rule in `CLAUDE.md` or `AGENTS.md`, the rule wins, and the disagreement is listed under *Open questions* rather than specified.
- **Errors:** every refusal below needs a typed exception plus a handler (the `PackRuleException` / `TeamRuleException` shape), so the body carries `{status, code, detail}`. A bare `ResponseStatusException` loses `detail` (trap 31). The web prints `detail` verbatim for invoice, check-in, workout and phone refusals.

## Backend pass — progress

Worked module by module, in this file's order, with a pause for review after
each. Nothing is committed yet; every module ships with its migration, its
`API.md` / `SCHEMA.md` entries and tests, and the full backend suite green.

| # | Module | Migration | Closed | Tests | Status |
|---|---|---|---|---|---|
| 1 | Setup / Profile | `V6__trainer_gender.sql` | `gender` on GET/PATCH `/v1/trainers/me` | `TrainerGenderTest` | ✅ 23 Sep |
| 2 | Clients | `V7__client_birth_date_and_shared_notes.sql` | `dateOfBirth`, clearing height / DOB, phone check on `PUT` (already existed), `sharedWithClient` on notes | `ClientPhysicalTest`, `ClientNoteTest` | ✅ 23 Sep |
| 3 | Business / Money | `V8__payment_invoice.sql` | write-off, invoice, `invoiceNo`/`invoicedAt` on payment rows, `method`/`paidAt` on confirm | `PaymentBillingTest` | ✅ 23 Sep |
| 4 | Workout log | — | `exerciseCount` | `WorkoutLogRestTest` | ✅ 23 Sep |
| 5 | Exercises | `V9__exercise_status_and_cues.sql` | `?source=`, wider `q`, `status`, `secondaryTargets`/`formCues` (columns only), `/categories`, `/{id}`, `target`/`status` on create | `ExerciseLibraryTest` | ✅ 23 Sep |
| 6 | Programs | `V10__program_exercise_workout.sql` | `workoutId`/`workoutName` on template and program rows, `assignedClients`, `apply` without a schedule + ending the prior plan, typed schedule errors. `notify` → module 11 | `ProgramWorkoutsTest` | ✅ 23 Sep |
| 7 | Certified programs | `V11__certified_templates.sql`, `V12__certified_used_count_is_not_a_revision.sql` | the three `/certified` routes, `source`/`copiedFrom` on templates, the certified write guards; **two sample programs** | `CertifiedProgramsTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 8 | Workouts (workout templates) | `V13__workout_template.sql` | all five `/v1/workout-templates` routes, normalisation, library check | `WorkoutTemplateTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 9 | Assessments (trainer side) | `V14__assessment_questionnaire.sql` (+ V5 rewritten: its sitting removed) | all ten trainer routes + `GET /v1/assessment-templates/{id}`; catalogue with V5 ids | `AssessmentQuestionnaireTest`, `MeasuringCycleTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 10 | Notifications (trainer bell) | `V15__trainer_notification.sql` | the three bell routes; the mint function; the `team` producer | `TrainerNotificationTest`, `TeamReassignTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 11a | Portal — reads | `V16__portal_reads.sql` | `GET /v1/me` and the 15 other reads | `PortalReadTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 11b | Portal — workout writes | `V17__portal_workouts.sql` | start, set, swap, finish (no charge); workout feedback; the 25th-workout milestone | `PortalWorkoutTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 11c | Portal — client writes | — (no migration) | assessment answers + submit; weigh-in, which rings the trainer's bell | `PortalClientWriteTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 11d | Portal — notifications & prefs | `V18__client_prefs_and_notifications.sql` | portal bell, `PATCH /v1/me/prefs`, eleven trainer-side mints behind a SECURITY DEFINER gate, `POST /v1/programs/{id}/notify` | `PortalNotifyTest`, `TenantIsolationTest` | ✅ 23 Sep |
| 11e | Portal — account | `V19__portal_account.sql`, `V20__portal_phone_guard.sql` | phone change (4), export, `PATCH /v1/me` (health), `DELETE /v1/me` (membership exit) | `PortalAccountTest`, `TenantIsolationTest` | ✅ 23 Sep |

Suite after module 11e: **350 tests, 0 failures**, against a freshly reset local database migrated V1–V20.

**The backend pass is complete: all 165 routes in this file are built.** What is left is not backend work:
- **Web-side fixes** (*Open questions* §13 lists them): switch `lib/log/api.ts` from `?size=2000` to `?ids=`; send `heightCm: 0` / `dateOfBirth: ""` to clear; read the assessment catalogue's keys from the server (three changed spelling); label the two certified programs as samples and handle `reviewedAt: null`; port `lib/clients/packs.ts` back (*Open questions* §4); change the *Remove client* card's "permanent" copy — the endpoint archives (*Open questions* §5, option (b) taken as the default).
- **Product decisions still open**, recorded as defaults here: whether a returned assessment should advance `next_assessment_on`; whether and how a nominee is told; the privacy-screen wording; when to strip the health items (catalogue Vitals, `q_pain`, `PATCH /v1/me` `health`).
- **Not verified end to end:** a real client sign-in into the portal on the dev stack (*Portal open questions* §10 — the seed cannot yet produce an attached client session).

## Counts

As measured when this file was written, and where the pass has taken them:

| | OK | SHAPE | MISSING | total | ✅ done since |
|---|---:|---:|---:|---:|---:|
| Trainer half — as written | 86 | 19 | 26 | 131 | |
| Trainer half — **now** | **131** | **0** | **0** | 131 | **45** (19 SHAPE, 26 MISSING) — complete |
| Portal `/v1/me/*` — **now** | **34** | 0 | **0** | 34 | **34** — complete |
| **All — now** | **165** | **0** | **0** | **165** | **79** — complete |

**P0 (9 trainer + 15 portal = 24 as written): ALL 24 CLOSED** (the portal's 15 by 11a); every P1 and P2 is closed too:
- ~~`PATCH`/`GET /v1/trainers/me` `gender`: setup step 1 can never be marked answered.~~ ✅ V6
- ~~`GET /v1/workout-templates`.~~ ✅ V13
- ~~`GET /v1/templates/certified` and `GET /v1/templates/certified/{id}`.~~ ✅ V11
- ~~`GET /v1/exercises/categories`: the whole `/programs/exercises` page fails.~~ ✅ 23 Sep
- ~~`GET /v1/assessments`, `GET /v1/assessments/{id}` and `GET /v1/assessment-templates`: three assessment screens.~~ ✅ V14
- ~~The 15 portal reads, of which `GET /v1/me` alone takes down every `/me/*` route.~~ ✅ 11a

~~The check-in rows are P0 *if check-ins ship in v1*.~~ **Decided 23 Sep 2026: they ship,** named *assessment* throughout — see *Open questions* §1–§2.

## Summary table

Trainer half. The lib function is given as `dir/file.fn` under `lib/`.

| Area | Method · endpoint | lib caller(s) | Status | Pri |
|---|---|---|---|---|
| Auth | POST `/v1/auth/otp/request` · `otp/verify` · `trainer` · `mode/trainer` · `mode/client` (5) | `auth/api.*` | OK | — |
| Setup/Profile | GET `/v1/trainers/me` | `setup/api.fetchProfile`, `profile/api.getIdentity`, `today/api.getToday`, +8 | ✅ DONE (V6, 23 Sep) | ~~P0~~ |
| Setup/Profile | PATCH `/v1/trainers/me` | `setup/api.patchProfile`, `profile/api.patchIdentity`, `account/api.patchAccount`, `packs/api.patchTrainerGym` | ✅ DONE (V6, 23 Sep) | ~~P0~~ |
| Setup/Profile | DELETE `/v1/trainers/me` | `account/api.deleteAccount` | OK | — |
| Setup/Profile | POST `/v1/trainers/me/phone/{challenge,verify,request,confirm}` (4) | `account/api.*` | OK | — |
| Setup/Profile | GET `/v1/working-hours` | `today/api`, `schedule/api`, `profile/api.getWorkingWeek`, `clients/new-api` | OK | — |
| Setup/Profile | GET `/v1/sync/pull` · POST `/v1/sync/push` (2) | `setup/api.fetchSyncTables`, `setup/api.push` | OK | — |
| Clients | GET `/v1/clients` | 13 callers (roster, today, schedule, money, …) | OK | — |
| Clients | POST `/v1/clients` · POST `/v1/clients/phone-availability` (2) | `clients/new-actions.createClient`, `checkPhone` | OK | — |
| Clients | GET `/v1/clients/{id}` | `clients/client-api.getClientDetail`, `programs/api.getClientPlan`, `reports/client-api`, `sessions/api` | ✅ DONE (V7, 23 Sep) | ~~P1~~ |
| Clients | PUT `/v1/clients/{id}` | `putClientContact`, `putClientPhysical`, `putClientStatus`, `new-actions.updateClientDetails`/`updateClientSchedule` | ✅ DONE (V7, 23 Sep) | ~~P1~~ |
| Clients | DELETE `/v1/clients/{id}` | `clients/client-api.archiveClientRow` | OK (copy mismatch, see *Open questions*) | — |
| Clients | GET `/v1/clients/{id}/body-metrics` | `getClientBodyMetrics`, `log/api.getProgress`, `reports/client-api` | OK | — |
| Clients | GET `/v1/clients/{id}/notes` | `getClientNotes`, `sessions/api.getSessionDetail` | ✅ DONE (V7, 23 Sep) | ~~P1~~ |
| Clients | POST `/v1/clients/{id}/notes` | `createNote` | ✅ DONE (V7, 23 Sep) | ~~P1~~ |
| Clients | PUT `/v1/clients/{id}/notes/{noteId}` | `editNote` (`setNoteShared`) | ✅ DONE (V7, 23 Sep) | ~~P1~~ |
| Clients | DELETE `/v1/clients/{id}/notes/{noteId}` | `removeNote` | OK | — |
| Clients | GET `/v1/clients/{id}/progress` | `sessions/api.bestsFor` | OK | — |
| Nudges | POST `/v1/clients/{id}/nudge` · GET `/v1/clients/{id}/nudges` · GET `/v1/nudges` (3) | `nudges/api.*`, `today/actions.remind/checkIn/wish`, `money/actions.sendReminder` | OK | — |
| Nudges | GET `/v1/nudge-templates` · PUT/DELETE `/v1/nudge-templates/{name}` (3) | `nudges/api.*` | OK | — |
| Today | GET · POST `/v1/attention/dismissals` · DELETE `/{id}` (3) | `today/api.getToday`, `today/actions.dismissRow`/undo | OK | — |
| Business | GET · POST `/v1/packs` · PATCH `/v1/packs/{id}` (3) | `packs/api.*`, `clients/client-api.getPriceList`, `clients/new-api` | OK | — |
| Business | GET `/v1/packages` · GET/POST `/v1/clients/{id}/packages` (3) | `money/api.getMoney`, `clients/client-api.sellPackage`, `today/actions.renew`, `log/api` | OK | — |
| Business | POST `/v1/packages/{id}/{renew,pause,resume,extend}` (4) · GET `/adjustments` | `clients/client-api.*` | OK | — |
| Business | GET `/v1/packages/{id}/payments` | `clients/client-api.getPackagePayments` | ✅ DONE (V8, 23 Sep) | ~~P1~~ |
| Business | POST `/v1/packages/{id}/payments` | `money/actions.recordPayment` | OK | — |
| Business | GET `/v1/payments` | `money/api.getMoney`, `today/api`, `clients/api` | OK | — |
| Business | PATCH `/v1/payments/{id}/confirm` | `money/actions.markPaid` | ✅ DONE (V8, 23 Sep) | ~~P2~~ |
| Business | PATCH `/v1/payments/{id}/write-off` | `money/actions.writeOffPayment` | ✅ DONE (23 Sep) | ~~P1~~ |
| Business | POST `/v1/payments/{id}/invoice` | `money/actions.issueInvoice` | ✅ DONE (V8, 23 Sep) | ~~P1~~ |
| Schedule | GET · POST `/v1/sessions` · GET/PUT/DELETE `/{id}` · POST `/{id}/done` (6) | `schedule/*`, `sessions/api`, `log/api`, `today/*` | OK | — |
| Workout log | GET `/v1/workouts` (incl. `?clientId=`) | `clients/client-api.getClientWorkouts`, +7 | ✅ DONE (23 Sep) | ~~P2~~ |
| Workout log | POST `/v1/workouts` · GET/PUT `/{id}` · GET `/sets` · GET/POST `/{id}/sets` · PUT/DELETE `/{id}/sets/{setId}` · GET/POST `/{id}/exercises` · PUT `/{id}/exercises/{rowId}` (11) | `log/*`, `sessions/api`, `today/*` | OK | — |
| Programs | GET `/v1/programs` · GET `/{id}` · PUT `/{id}/exercises/{exId}` · POST `/{id}/resync` (4) | `programs/api.*`, `log/actions.setRest/swapExercise` | OK | — |
| Programs | GET `/v1/programs/{id}/exercises` | `programs/api.getClientPlan`, `log/*`, `sessions/api` | ✅ DONE (V10, 23 Sep) | ~~P1~~ |
| Programs | PUT `/v1/programs/{id}/exercises` | `programs/api.putProgramBlueprint` | ✅ DONE (V10, 23 Sep) | ~~P1~~ |
| Programs | POST `/v1/programs/{id}/notify` | `programs/api.postPlanNotice` | ✅ DONE (V18, 23 Sep) | ~~P1~~ |
| Programs | GET `/v1/templates` | `programs/api.getShelf/getBuilder/getCertifiedShelf`, `clients/new-api` | ✅ DONE (V10 + V11, 23 Sep) | ~~P1~~ |
| Programs | POST `/v1/templates` | `programs/api.postTemplate` | ✅ DONE (23 Sep) | ~~P1~~ |
| Programs | GET `/v1/templates/{id}` | `programs/api.getBuilder/getClientPlan` | ✅ DONE (V10 + V11, 23 Sep) | ~~P1~~ |
| Programs | PUT `/v1/templates/{id}` | `programs/api.putTemplate`, `log/actions.swapExercise` | ✅ DONE (23 Sep) | ~~P1~~ |
| Programs | DELETE `/v1/templates/{id}` · POST `/{id}/duplicate` · GET `/{id}/assignments` (3) | `programs/api.*` | OK | — |
| Programs | POST `/v1/templates/{id}/apply` | `programs/api.postApply`, `clients/new-actions.applyTemplate` | ✅ DONE (23 Sep) | ~~P1~~ |
| Certified | GET `/v1/templates/certified` | `programs/api.getCertifiedShelf/getCertifiedList` | ✅ DONE (V11, 23 Sep) | ~~P0~~ |
| Certified | GET `/v1/templates/certified/{id}` | `programs/api.getCertifiedPreview` | ✅ DONE (V11, 23 Sep) | ~~P0~~ |
| Certified | POST `/v1/templates/certified/{id}/copy` | `programs/api.postCertifiedCopy` | ✅ DONE (V11, 23 Sep) | ~~P1~~ |
| Workouts | GET `/v1/workout-templates` | `workouts/api.getWorkoutTemplates` | ✅ DONE (V13, 23 Sep) | ~~P0~~ |
| Workouts | GET `/v1/workout-templates/{id}` | `workouts/api.getWorkoutTemplate` (`fetchWorkoutTemplate`) | ✅ DONE (V13, 23 Sep) | ~~P1~~ |
| Workouts | POST · PUT `/{id}` · DELETE `/{id}` `/v1/workout-templates` (3) | `workouts/api.create/update/deleteWorkoutTemplate` | ✅ DONE (V13, 23 Sep) | ~~P1~~ |
| Exercises | GET `/v1/exercises` (search and `?ids=`) | `exercises/api.getExercises`, `programs/api.namesByCsv`, `sessions/api`, `log/api.allExercises`, `reports/client-api` | ✅ DONE (V9, 23 Sep) | ~~P1~~ |
| Exercises | GET `/v1/exercises/meta` | `exercises/api.getExercisesMeta` | OK | — |
| Exercises | GET `/v1/exercises/categories` | `exercises/api.getExerciseCategories` | ✅ DONE (23 Sep) | ~~P0~~ |
| Exercises | GET `/v1/exercises/{id}` | `exercises/api.getExercise` | ✅ DONE (23 Sep) | ~~P1~~ |
| Exercises | POST `/v1/exercises` | `exercises/api.createExercise` | ✅ DONE (V9, 23 Sep) | ~~P1~~ |
| Assessments | GET `/v1/assessments` | `assessments/api.getAssessments/getClientAssessments/getAssessmentTemplates` | ✅ DONE (V14, 23 Sep) | ~~P0~~ |
| Assessments | GET `/v1/assessments/{id}` | `assessments/api.getAssessment` | ✅ DONE (V14, 23 Sep) | ~~P0~~ |
| Assessments | POST `/v1/assessments` · PATCH/DELETE `/{id}` (3) | `assessments/actions.scheduleAssessment/setRead/deleteAssessment` | ✅ DONE (V14, 23 Sep) | ~~P1~~ |
| Assessments | GET `/v1/assessment-templates` | `assessments/api.getAssessmentTemplates` (not lenient) | ✅ DONE (V14, 23 Sep) | ~~P0~~ |
| Assessments | POST · PUT `/{id}` · DELETE `/{id}` `/v1/assessment-templates` (3) | `assessments/actions.*Template` | ✅ DONE (V14, 23 Sep) | ~~P1~~ |
| Assessments | GET `/v1/assessment-catalog` | `assessments/api.*` (lenient → null) | ✅ DONE (V14, 23 Sep) | ~~P1~~ |
| Notifications | GET `/v1/notifications` | `notifications/api.listNotifications` (lenient → `[]`) | ✅ DONE (V15, 23 Sep) | ~~P2~~ |
| Notifications | POST `/v1/notifications/{id}/read` · POST `/v1/notifications/read` (2) | `notifications/actions.markRead/markAllRead` | ✅ DONE (V15, 23 Sep) | ~~P2~~ |
| Team | 19 routes: GET/POST/PATCH/DELETE `/v1/team`, `members`, `invites`, `invitations`, `clients`, `reassign`, `templates`, `copy`, `revenue`, `activity` | `team/*`, `workspace/api` | OK (unchanged since the port) | — |

Portal half. All MISSING; the detail is in §Portal.

| Area | Method · endpoint | Status | Pri |
|---|---|---|---|
| Portal | GET `/v1/me` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| Portal | GET `/v1/me/sessions`, `/program`, `/programs`, `/programs/{id}`, `/workouts`, `/workouts/{id}`, `/sets`, `/metrics`, `/packages`, `/payments`, `/messages`, `/milestones`, `/assessments`, `/assessments/{id}` (14) | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| Portal | POST `/v1/me/workouts`, `/workouts/{id}/sets`, `/swap`, `/finish`; POST `/v1/me/metrics`; GET `/v1/me/exercises`; GET `/v1/me/notifications`; POST `/v1/me/assessments/{id}/answers`, `/submit`; GET `/v1/me/export`; PATCH `/v1/me/prefs`; POST `/v1/me/phone/{challenge,verify,request,confirm}`; DELETE `/v1/me` (17) | ✅ DONE (11b–11e, 23 Sep) | ~~P1~~ |
| Portal | POST `/v1/me/notifications/{id}/read`, `/v1/me/notifications/read` (2) | ✅ DONE (11d, 23 Sep) | ~~P2~~ |
| Portal | PATCH `/v1/me` (its only field is `health`, see *Open questions*) | ✅ DONE (11e, 23 Sep) — `health` only; `phone` refused | ~~P2~~ |

**Not a gap.** Reports (`/business/reports`, `/clients/:id/report`, the PDF and the PNG card) are assembled in the browser from endpoints marked OK above: `lib/reports/build.ts`, `pdf.ts`, `report-pdf.ts` and `card-image.ts` make no new request. The business Overview (`lib/business/overview.ts`) likewise reads only `getMoney()`. `POST /v1/auth/google` is referenced but never called (`GOOGLE_SIGN_IN_ENABLED = false`). It needs a product decision before an endpoint (mock `BACKEND_GAPS.md` §Google).

---

## Gaps by area

### Setup / Profile

#### `GET` · `PATCH /v1/trainers/me`: `gender` · SHAPE · **P0**

> ✅ **Done 23 Sep 2026 — `V6__trainer_gender.sql`.** `trainer.gender varchar(24)`, validated against the four ids in `TrainerService` (an unknown id is `400 VALIDATION` with a `detail`), null leaves alone, `""` clears, appended last to `TrainerResponse`. Test: `TrainerGenderTest`.

- **What the UI sends and reads.** `lib/setup/actions.ts:saveName` now refuses step 1 without a gender and PATCHes `{ name, gender, headline }`. `lib/setup/api.ts:75,110,413` reads `profile.gender` back, and `lib/setup/steps.ts:190` defines step 1 as answered only when `name` is non-empty **and** `gender !== null`.
- **What the backend does.** `TrainerService.UpdateRequest` has no `gender`, so Jackson drops it silently. `TrainerResponse` has no `gender`. **Result:** step 1 is never answered, `nextStep` sends the trainer back to it forever, and `skipToHome` refuses. No trainer can finish setup.
- **Vocabulary.** It is the ids from `lib/setup/options.ts` `asGender` (`"Prefer not to say"` is a real answer, not null). The mock stores the value verbatim; the server should validate it against the same list.
- **Change (V6).**
  - Schema: `ALTER TABLE trainer ADD COLUMN gender varchar(24) NULL`.
  - `UpdateRequest.gender`: null leaves it alone, `""` clears it.
  - `TrainerResponse.gender`, appended last.
  - V6 is backend + web only, and nothing enters sync.
- **Rule touched.** It is profile data a client reads (trainer search, *filter for a woman trainer*: `steps.ts:85`). It is not health data.

### Clients

#### `GET` · `PUT /v1/clients/{id}`: `dateOfBirth` · SHAPE · P1

> ✅ **Done 23 Sep 2026 — `V7__client_birth_date_and_shared_notes.sql`.** `client.date_of_birth date`, `""` clears, a future / >120-year / unparseable date is `400 VALIDATION` with `detail`. **Height clears with `heightCm: 0`** (the web must send `0` and `""`, not `null`, to clear). The phone check on `PUT` **already existed** (`ClientPhoneGuard`, `409` + `PHONE_ON_YOUR_ROSTER` / `PHONE_ON_ANOTHER_ROSTER` / `PHONE_IS_TRAINER`) — now covered by `ClientPhysicalTest`.

- **What the UI does.** `components/clients/file/PersonalTab.tsx:557–582` draws a *Physical information* card (height, latest weight, birth date with age). `lib/clients/contact-actions.ts` saves through `putClientPhysical` with `{ heightCm: number | null, dateOfBirth: 'YYYY-MM-DD' | null }`.
- **What already exists.** `client.height_cm`, `heightCm` on `CreateClientRequest` / `UpdateClientRequest` / `ClientResponse`. The mock's `BACKEND_GAPS.md` still lists height as missing, which is stale.
- **What is missing.**
  - `date_of_birth`: no column and no DTO field.
  - **Clearing:** the UI sends `null` to clear, but `UpdateClientRequest` treats null as *leave alone*. So a trainer cannot clear a height or a birth date. Use `""` for `dateOfBirth`, as V5 does for `nextAssessmentOn`, and `0` for `heightCm`, **or** have the web send those sentinels.
  - **Phone uniqueness on update:** `putClientContact` sends `{ name, phone }` and handles a `409` with *"That number is already on somebody else on your roster"*. `POST /v1/clients` runs `ClientPhoneGuard`, and `PUT` should run it too, answering `409` with a code (`PHONE_ON_ANOTHER_ROSTER` / `PHONE_TAKEN`).
- **Change (V6).**
  - Schema: `ALTER TABLE client ADD COLUMN date_of_birth date NULL`.
  - `UpdateClientRequest.dateOfBirth` (ISO, `""` clears).
  - `ClientResponse.dateOfBirth`, appended last.
  - Nothing enters sync.
- **Rule touched.** `AGENTS.md` *"There is no date of birth in this schema"* has to be rewritten in the same commit. The mock's gap entry records that the metabolism rows DOB was added for were cut, and that `client.sex` must **not** be added. DOB alone is personal data, not health data.

#### `GET` · `POST` · `PUT /v1/clients/{id}/notes[/{noteId}]`: `sharedWithClient` · SHAPE · P1

> ✅ **Done 23 Sep 2026 — V7.** `client_note.shared_with_client boolean NOT NULL DEFAULT false`; only an explicit `true` shares on create, null leaves it alone on `PUT`, `false` retracts. Empty/over-long note bodies now answer a typed `400 VALIDATION` with `detail` (they were bare `ResponseStatusException`s). The portal read of shared notes lands with `/v1/me/messages`.

- **Request.** `createNote(clientId, body, pinned, sharedWithClient)` and `editNote(…, { body?, pinned?, sharedWithClient? })` (`lib/clients/client-api.ts:645–668`, `notes-actions.ts:setNoteShared`).
- **Response.** `ClientNoteWire.sharedWithClient?: boolean`. The web coerces the value with `=== true`.
- **Mock behaviour.** `mock/router.ts:1969–1995`: the field is stored only when the body says exactly `true`, so a missing field means private. `PUT` merges.
- **What the backend does.** `NoteRequest` is `{ body, pinned }`, and `NoteResponse` has no field. The switch silently does nothing.
- **Change (V6).**
  - Schema: `ALTER TABLE client_note ADD COLUMN shared_with_client boolean NOT NULL DEFAULT false`. **The default must be in the DDL.** Every existing note was written as private.
  - `NoteRequest.sharedWithClient` (Boolean, null leaves alone). `NoteResponse.sharedWithClient`.
  - The portal's `GET /v1/me/messages` then returns the union of `client_message` and shared notes (§Portal).
- **Rules touched.** V29: the note is `trainer_id`-private and a teammate gets an empty list. That still holds, because sharing goes to the **client**, never to a teammate. *No health data*: a shared note must not grow a medical flag.

### Business / Money

#### `PATCH /v1/payments/{id}/write-off` · MISSING · P1

> ✅ **Done 23 Sep 2026.** As specified, plus one addition the mock does not model: the row's amount is **added to `package.written_off_amount`** in the same transaction, because `amountDue = amount − paid − writtenOff` and a pending row is not in that sum — without it the debt would not drop. A second press returns the row unchanged (no double-forgiving). A written-off row cannot then be confirmed (`409 WRITTEN_OFF`). Test: `PaymentBillingTest`.

- **Request:** `{ reason?: string }`. **Response:** `PaymentResponse`.
- **Screen:** the `/business` Write-offs tab and `components/money/PaymentRowMenu.tsx`. Nothing anywhere can write `status = 'write_off'` today.
- **Mock behaviour** (`mock/router.ts:2346–2355`):
  - `status = 'write_off'`, `paidAt = null`, `gymShareAmount = null`.
  - The reason is appended to `note` (`"<old> · <reason>"`).
  - The package's `amountPaid` / `amountDue` are recomputed, counting only `paid` and `confirmed` rows.
- **Server rules** (`PackageService.java` already assumes this):
  - It is not a delete: amount, client and date stay.
  - It never counts as collected. `amountDue` is `amount − paid − writtenOff`, floored at 0.
  - Refuse an already-collected row with `409 ALREADY_COLLECTED`, and a row that is not the caller's with `404`.
  - Trainer-owned, in the active workspace (the money book is always the active workspace alone).
- **Migration:** none. `payment.status` is varchar with no CHECK, and `note` exists.

#### `POST /v1/payments/{id}/invoice` · MISSING · P1

> ✅ **Done 23 Sep 2026 — `V8__payment_invoice.sql`.** `payment.invoice_no` / `invoiced_at`, unique `(trainer_id, invoice_no)`, and an `invoice_counter (trainer_id, fy, last_seq)` locked by its upsert. **Decisions taken:** the series is per trainer across workspaces (so the counter has no `tenant_id` and is on SCHEMA.md's not-policied list), and a pending row is refused with `409 NOT_PAID`. `GYM_COLLECTED` / `WRITTEN_OFF` use the mock's sentences.

- **Request:** `{}`. **Response:** the payment row, with `invoiceNo` and `invoicedAt`. The web reads only `invoiceNo`.
- **Screens:** the client file's Payments tab (`components/clients/file/PaymentsTab.tsx`, `PackPanel.tsx`) and `lib/clients/billing.ts:invoiceMessage`, which builds a WhatsApp bill with the trainer's `upiVpa`.
- **Mock behaviour** (`mock/router.ts:2377–2400`):
  - **Idempotent:** a row that already has `invoiceNo` returns unchanged.
  - `collectedBy = 'gym'` → `409 GYM_COLLECTED`, *"The gym collected this one and raises its own receipt. Invoices here are for the clients you collect from yourself."*
  - `status = 'write_off'` → `409 WRITTEN_OFF`, *"This one was written off. There is nothing to bill for."*
  - Otherwise it mints `INV-<FY>-<NNNN>`. The FY runs April–March, so Sep 2026 is `2627`. The sequence is **per trainer, per financial year**, continuing from the highest number already used, and is 4-digit padded (`mock/seed.ts:117–127`). It then stamps `invoicedAt = now`.
  - The web shows `detail` on 409/422 (`lib/money/actions.ts:issueInvoice`).
- **Server rules:**
  - The number is never minted on write, only on request.
  - The sequence must be gap-free and collision-free under concurrency. Use a per-(trainer, FY) counter row and `SELECT … FOR UPDATE`, or a unique index `(trainer_id, invoice_no)` plus a retry.
  - Pending rows: the mock allows them, but decide whether an unpaid row may be invoiced. `invoiceMessage` prints *Paid on*, so probably refuse with `409 NOT_PAID`.
- **Migration (V6):**
  - `ALTER TABLE payment ADD COLUMN invoice_no varchar(20) NULL, ADD COLUMN invoiced_at timestamptz NULL`.
  - `CREATE UNIQUE INDEX … ON payment (trainer_id, invoice_no) WHERE invoice_no IS NOT NULL`.
  - Optionally a `invoice_counter (trainer_id, fy, last_seq, tenant_id)` table.
- **Wire:** append `invoiceNo` and `invoicedAt` to `PackageService.PaymentResponse` (read by `ClientPaymentWire`).
- **Rule touched.** `PRICING.md` wants GST-compliant invoices for InclineYou's own billing. This is the **trainer's** bill to a client. It computes no tax (the GST tab only tracks headroom), and the copy must not imply it is a tax invoice.

#### `GET /v1/packages/{id}/payments`: `invoiceNo`, `invoicedAt` · SHAPE · P1

This is the wire half of the entry above. `ClientPaymentWire.invoiceNo?` and `invoicedAt?` are what decide between *Raise an invoice* and *INV-2627-0007* on each row.

#### `PATCH /v1/payments/{id}/confirm`: `method`, `paidAt` · SHAPE · P2

> ✅ **Done 23 Sep 2026.** `method` and `paidAt` honoured; a future `paidAt` (beyond 5 minutes of clock skew) is `400 VALIDATION`. The gym share is still stamped only when `collectedBy = 'gym'` and not already stamped (unchanged).

- **What the UI sends.** `markPaid` sends `{ method, paidAt, upiReference? }` (`lib/money/actions.ts`).
- **What the backend does.** `ConfirmPaymentRequest` is `{ upiReference }` only, and `confirmPayment` stamps `paid_at = now()`. So a trainer settling Tuesday's cash on Thursday gets Thursday's date, and a pending row whose method was unknown stays `method = null`.
- **Mock behaviour** (`mock/router.ts:2331–2344`):
  - It honours `paidAt` (epoch ms) and `method`.
  - It stamps the gym share only when `collectedBy = 'gym'` and the share is not already stamped.
- **Change:** add `method` and `paidAt` (nullable) to `ConfirmPaymentRequest`. Refuse a future `paidAt` with `400`. No migration.

### Schedule / Sessions / Workout log

#### `GET /v1/workouts[?clientId=]`: `exerciseCount` · SHAPE · P2

> ✅ **Done 23 Sep 2026.** `WorkoutSessionResponse.exerciseCount`, appended last, on every workout read. One deviation from the mock: a log with **no** `workout_exercise` rows at all (pre-V13, or an old phone build) falls back to `count(DISTINCT exercise_id)` over its `set_log`, so it never reads 0 against a full sheet. No migration. Tests in `WorkoutLogRestTest`.

- **Reader:** `ClientWorkoutWire.exerciseCount?`, used by the client file's Sessions table `Exercises` column (`lib/clients/sessions-table.ts`). A missing count draws a dash, never 0.
- **Mock behaviour:** `withExerciseCount` (`mock/router.ts:1605`) counts `workout_exercise` rows with `removed_at IS NULL`.
- **Change:** append `Integer exerciseCount` to `WorkoutSessionResponse`, computed as a `LEFT JOIN (SELECT workout_session_id, count(*) … WHERE removed_at IS NULL AND deleted_at IS NULL GROUP BY 1)`. No migration.
- **Already closed** (the mock's own gap doc still lists them): `SessionResponse.updatedAt`, and `scheduledSessionId` / `programId` on `WorkoutSessionResponse`.

### Exercises

#### `GET /v1/exercises`: search params and fields · SHAPE · P1

> ✅ **Done 23 Sep 2026 — `V9__exercise_status_and_cues.sql`.** `status`, `secondary_targets`, `form_cues` columns; `?source=` and the widened `q` as specified; three fields appended to `ExerciseResponse`. **`secondary_targets` and `form_cues` are empty on every row by decision** (columns only — content is a later, authored pass), and the wire always sends `[]`, so the web's required-array typing holds. `source` is not applied to `?ids=` reads, so a draft named in a plan still resolves. Drafts ride the phone's pull as ordinary rows (see V9 for why that beats filtering them). The web's `?size=2000` still needs switching to `?ids=` — web-side.

| | UI / mock | Backend (`ExerciseController.search`, `ExerciseService.search`) |
|---|---|---|
| `?source=all\|incline\|mine\|draft` | `lib/exercises/api.ts:getExercises`. `incline` = `!isCustom`; `mine` = custom and not draft; `draft` = `status='draft'`; anything else = everything except drafts (`mock/router.ts:1250–1254`) | param does not exist, so all four options draw the same list |
| `q` matches | `name`, `target`, `movement_pattern`, `body_part` (`mock/router.ts:1220`) | **`name` only** (`ExerciseService.java:161`) |
| `size` | the library pages at `EXERCISES_PAGE_SIZE` | clamped to **100** (`:115`). `lib/log/api.ts:257` asks `?size=2000` for "the whole library", so the console's names past row 100 are silently missing. **Web fix:** use `?ids=`, which `log/api` already has the ids for. Do not raise the cap. |
| `total` | counted **after** every filter | ✓ |
| row `status` | `'published' \| 'draft'` | no column |
| row `secondaryTargets: string[]`, `formCues: string[]` | `ExerciseWire` declares both as non-optional arrays | no columns. The web must treat `undefined` as `[]` until they land |
| row `imageUrl`, `videoUrl` | not read | still on `ExerciseResponse` though V22 dropped the media. Harmless (null) |

- **Change (V6):**
  - `ALTER TABLE exercise ADD COLUMN status varchar(12) NOT NULL DEFAULT 'published'`. It is a status, not an `is_draft` flag, because `archived` is the known next value.
  - `ADD COLUMN secondary_targets jsonb NULL`, `ADD COLUMN form_cues jsonb NULL`.
  - `source` as one predicate. `q` widened by three `OR … ILIKE` terms.
  - Append `status`, `secondaryTargets`, `formCues` to `ExerciseResponse`.
- **Content rule.** The mock's generated cues (`mock/exercise-info.ts`) must **not** be seeded. A generated form cue served as real is a coaching instruction nobody wrote.
- **RLS.** `exercise` is tier 3 (`tenant_id IS NULL` for the global library). Drafts only exist on custom rows, so the default must not hide any catalogue row.

#### `POST /v1/exercises`: `target`, `status` · SHAPE · P1

> ✅ **Done 23 Sep 2026.** Both on `CreateExerciseRequest`; only the literal `draft` makes a draft.

- **Request.** `createExercise` sends `{ name, muscleGroup?, target?, equipment?, description?, status?: 'published'|'draft' }`.
- **What the backend drops.** `CreateExerciseRequest` has no `target` or `status`, so a *Save as draft* lands published and the target is lost.
- **Mock rule** (`mock/router.ts:2527–2554`): anything but the literal `draft` is published, because a movement silently filed as a draft vanishes from the library. A custom movement gets **no** generated pattern, cues or secondary targets.
- **Change:** add both fields to `CreateExerciseRequest`. `logType` is already there.

#### `GET /v1/exercises/categories` · MISSING · **P0**

> ✅ **Done 23 Sep 2026.** As specified; a group only a custom row uses is ordered after the catalogue's, alphabetically. Test: `ExerciseLibraryTest`.

- **Response:** `{ categories: { muscleGroup: string; count: number }[]; total: number; uncategorised: number }`.
- **Screen:** `/programs/exercises` *By categories*. `lib/exercises/guard.ts:requireExercises` fetches it in the same `Promise.all` as the list, so its absence fails the **whole page**.
- **Behaviour** (`mock/router.ts:1171–1193`):
  - The count covers the **caller's** library: the global rows plus this trainer's custom rows. Drafts are excluded.
  - Rows with no `muscle_group` go into `uncategorised`, not into a card.
  - Groups with count 0 are dropped.
  - Ordered by the fixed `MUSCLE_GROUPS` list (`/v1/exercises/meta` order), **never** by count.
  - `total` = every non-draft row visible to the caller.
- **Implementation:** declare the literal path **before** any future `/{id}` mapping. It is `GROUP BY muscle_group` under the tier-3 policy. No migration beyond `exercise.status`.

#### `GET /v1/exercises/{id}` · MISSING · P1

> ✅ **Done 23 Sep 2026.** Drafts included for their owner; anything not visible is 404.

- **Response:** one `ExerciseWire` (the full row, including `secondaryTargets` and `formCues`).
- **Screens:** `ExerciseInfoPanel` (the builder row menu, the workout builder's `LibraryPane`) through `lib/exercises/api.ts:getExercise`.
- **Behaviour:** 404 when the row is not visible under tier-3 RLS. No migration. It is a one-method addition returning `ExerciseResponse`.

### Programs: blueprints, client copies, assignment

The redesign turned a program **day** into a list of **workouts**. A day can hold more than one named block ("Upper A", then "Conditioning"), and a workout template can be poured into a day (`lib/programs/fromWorkout.ts`, `lib/programs/blueprint.ts:123–130, 442–460, 639–648`). The container is carried on every row:

```ts
interface TemplateExerciseWire { …existing V31 fields…; workoutId?: string | null; workoutName?: string | null }
```

#### Template and program rows: `workoutId`, `workoutName` · SHAPE · P1

> ✅ **Done 23 Sep 2026 — `V10__program_exercise_workout.sql`.** Template side needs no migration (keys `workout_id` / `workout_name` in `template.structure`); `program_exercise.workout_id varchar(64)` / `workout_name varchar(120)`. Carried by create/update/duplicate, `apply`, `resync`, the copy's `PUT …/exercises` and `POST`/`PUT` of one row (`""` clears on the row PUT). Trimmed and cut to width. The id is stored as sent and **never re-minted** (it is the board's handle); `PlanDiff` ignores both. Not in `pushProgramExercises`, so no phone can null them. Test: `ProgramWorkoutsTest`.

The shape change touches all of these: GET/POST/PUT `/v1/templates[/{id}]`, GET `/v1/programs/{id}/exercises`, and PUT `/v1/programs/{id}/exercises`.

- **What is lost.**
  - `TemplateService.TemplateExerciseInput` / `TemplateExerciseResponse` and `ProgramService.ProgramExerciseRequest` / `ProgramExerciseResponse` have neither field.
  - Both are dropped on every save and absent on every read. `blueprint.ts:245` then falls back to `seedWorkoutId(week, day)`, **one container per day**, so two workouts on a day merge into one and lose their names on the next reload.
  - `duplicate` copies the stored JSON verbatim, so the keys survive a duplicate and then die on the first `PUT`.
- **Change:**
  - Template: `template.structure` is one jsonb blob, so this needs **no migration**. Add both fields to `TemplateExerciseInput` and `TemplateExerciseResponse`, and have `parseStructure` / serialise carry them.
  - Program: V6 `ALTER TABLE program_exercise ADD COLUMN workout_id varchar(64) NULL, ADD COLUMN workout_name varchar(120) NULL`. Add both to `ProgramExerciseRequest`, `UpdateProgramExerciseRequest` and `ProgramExerciseResponse`.
  - `apply` and `resync` copy both, and `PlanDiff` should ignore `workoutId`, which is a local handle, but may report a renamed `workoutName`.
- **The id is a local handle.** The web mints it (`newWorkoutId`). It is **not** a foreign key to `workout_template` (`fromWorkout.ts` re-mints ids on purpose), so it is varchar and unindexed.
- **Sync rule.** `program_exercise` is in the phone's sync. Additive only: `pushProgramExercises`' upsert must not null these on a phone push. Leave them out of the upsert column list, as V30 did for `paused_at`.

#### `GET /v1/templates[/{id}]`: `assignedClients`, `source`, `copiedFrom` · SHAPE · P2 (P1 with certified)

> ◐ **`assignedClients` done 23 Sep 2026** — ≤ 6 clients on an *active* copy, distinct, ordered by name then id, one query for the whole shelf, on the list and on `GET /{id}`. **One narrowing vs the mock:** only the caller's own clients, because a copy can sit with a teammate after reassignment. `source` / `copiedFrom` land with module 7 (certified).
>
> ✅ **`source` / `copiedFrom` done with module 7 (V11)** — `source` is `own` on every trainer row; `copiedFrom` is `{id, name, updatedAt}` frozen at copy time, or null.

- **`assignedClients: {id, name}[]`.** The shelf's avatar cluster. It is a sample of at most **6** active assignees, total-ordered by name then id (`mock/router.ts:185, 204–230`). `activeAssignedCount` stays the authority for the overflow, and the mock's comment states nothing may derive a count from the array length. The backend has the counts but not the sample.
- **`source: 'own' | 'certified'` and `copiedFrom: {id, name, updatedAt} | null`.** These belong to the certified feature (next section). `copiedFrom` is what lets the builder print *the original was revised since you copied it*.

#### `POST /v1/templates/{id}/apply`: schedule optional · end the prior plan · SHAPE · P1

> ✅ **Done 23 Sep 2026.** (1) No `schedule` → derived by position from `client.weekly_schedule` (weekday, then time) and stored as `program.schedule`; a count mismatch or no week is `400 SCHEDULE_MISMATCH` with a sentence naming both numbers. The explicit-schedule refusals are typed too now (`SCHEDULE_MISMATCH` / `SCHEDULE_INVALID`, `ProgramRuleException`). (2) Every other `active` program **of the caller's** for that client becomes `completed` with `end_date = LEAST(COALESCE(end_date, today), today)` — a teammate's plan is untouched. Return shape unchanged.

Two behaviour differences.

1. **No `schedule` sent.**
   - The redesigned add-client flow calls `applyTemplate(templateId, { clientId })` with no `schedule` (`components/clients/AddClientFlow.tsx:918`, `lib/clients/new-actions.ts:117`). The mock then names the sessions already booked from the client's standing week (`mock/router.ts:2759–2763`, `setStandingWeek` returns false and `reconcileDiary` relabels).
   - The backend's `validateSchedule` (`TemplateService.java:944`) answers `400` for any template with days, and trap 31 swallows the sentence.
   - **Change:** when `schedule` is null or empty and the client has a `weekly_schedule` with the same slot count, derive it server-side by **position**. The client's k-th slot (by weekday, then time) takes the template's k-th training day, exactly `lib/programs/schedule.ts:pairSchedule`, which the web has now deleted.
   - A mismatch keeps the 400, but through a typed `ProgramRuleException` with `code: SCHEDULE_MISMATCH` and the sentence.
   - The panel path (`programs/api.postApply`) still sends an explicit schedule and is unaffected.
2. **The prior plan.**
   - The mock marks every other `active` program for that client `completed` (`mock/router.ts:2716`). The backend leaves two `active`, and `AGENTS.md` already calls ending it "a backend change".
   - The redesigned UI reads `programs.find(p => p.status === 'active')` (`components/clients/file/OverviewTab.tsx:317`, `ProgramTab.tsx:142`), so with two live plans it shows an arbitrary one.
   - **Change:** in the same transaction, set older active programs for that client to `completed`, and set `end_date` if null. **Scope:** the caller's own programs for the client only. A teammate's plan on a reassigned client is not the caller's to end, because a team widens reads and never moves ownership.
   - Return `ProgramSummary` as today.
   - Keep the V3 booking return (`sessionsBooked` / `firstSessionAt` on the reconcile) available, even though the redesigned flow no longer prints it.

#### `POST /v1/programs/{id}/notify` · MISSING · P1

> ✅ **Done 23 Sep 2026 (with 11d).** `{sent}` — `false`, not an error, when the client switched plan notices off; writes nothing to the plan; owning trainer only (404 otherwise). `PUT /v1/programs/{id}` also rings `plan` when the name, goal or dates change (not on a status flip).

> ⏳ **Deferred to module 11 (portal), 23 Sep 2026.** It mints a `client_notification`, which does not exist until the portal's tables do; shipping it earlier would mean a route that always answers `{sent:false}`.

- **Request:** none. **Response:** `{ sent: boolean }`.
- **Screen:** the client's-copy builder's optional *Tell {client}* after a save (`components/clients/plan/ClientPlan.tsx`, `lib/programs/actions.ts:notifyPlanChange`).
- **Behaviour** (`mock/router.ts:2831–2844`):
  - It writes **nothing to the program**. `PUT …/exercises` deliberately mints nothing, because a typo fix is not an event.
  - It mints one client notification: `kind: 'plan'`, `subjectAt = program.createdAt`, `text = program.name`, `at = now`. `subjectAt ≠ at` is how the portal words it as *changed your plan* rather than *new plan*.
  - If the client has `notify.programUpdated = false`, nothing is minted, and the response is `200 {sent:false}`, **not** an error.
- **Authorization:** the program's owning trainer only.
- **Depends on** `client_notification` and `client_prefs` (§Portal). Ship it with the portal tables, or answer `{sent:false}` until they exist.

### Certified programs

This builds the mock repo's `BACKEND-CERTIFIED-PROGRAMS.md` (§1–§8) verbatim, except for two corrections below. Its three decisions are fixed:
- the programs are authored in-house;
- using one COPIES it;
- nothing propagates.

#### `GET /v1/templates/certified` · MISSING · **P0**

> ✅ **Done 23 Sep 2026 — `V11__certified_templates.sql` (+ `V12`).** Correction (b) taken: its own **`certified_template`** table, a read-only catalogue (one `FOR SELECT` policy, no write policy; `used_count` moves only through the `SECURITY DEFINER` `certified_template_used()`). Literal paths declared before `/{id}`. Shape as specified, plus **`certified.sample`** (appended) — see the two samples note below. Ordered beginner → advanced, then name. Tests: `CertifiedProgramsTest`, and the read-only wall in `TenantIsolationTest`.
>
> **Two sample programs ship in V11**, at the product owner's request (23 Sep): *Full-body foundations* (beginner, dumbbells, 3 days × 6 weeks, 15 entries) and *Upper / lower strength* (intermediate, full gym, 4 days × 8 weeks, 21 entries, with V10's named workouts). Both have **`sample: true` and `reviewedAt: null`** — nobody has reviewed them, and `reviewedAt` must mean a human review. **The web should label them as samples and handle a null `reviewedAt`.** Replace them with a later migration once the real catalogue is written.
>
> **How the blueprint names movements:** by the catalogue's stable `exercise_source_id` (`gymvisual-0025`), resolved to this database's `exercise.id` on every read, because catalogue UUIDs are minted by the seeder after migrations run. The wire carries ordinary `exerciseId`s.

- **Screens:** `/programs/certified`, plus the "start from" chooser (`lib/programs/actions.ts:certifiedChoices`).
- **Current failure.** Today the request answers **400, not 404**. `GET /v1/templates/{id}` binds `certified` as a UUID and fails to parse it. **Declare the literal paths before `/{id}`.**
- **Response** (`CertifiedWire[]`):

  ```ts
  TemplateWire & {
    exercises: [];                 // never sent on the list
    exerciseCount: number;
    assignedCount: 0; activeAssignedCount: 0; assignedClients: [];
    certified: { summary: string; level: 'beginner'|'intermediate'|'advanced';
                 equipment: 'full-gym'|'dumbbells'|'bodyweight';
                 reviewedAt: number /* a human review date, NOT updated_at */; usedCount: number };
    mine: { id: string; copiedAt: number; stale: boolean } | null  // the CALLER's copy
  }
  ```

- **`mine`:** the caller's own template with `copied_from_id = this.id`. `stale` means `copied_from_updated_at < certified.updated_at`.
- **`empty`:** the list is **not** emptied for a brand-new trainer (`mock/router.ts:1296`).

#### `GET /v1/templates/certified/{id}` · MISSING · **P0**

> ✅ **Done 23 Sep 2026.** As specified; unknown or retired → `404 CERTIFIED_NOT_FOUND`.

- **Screen:** `/programs/certified/[certifiedId]`, the preview.
- **Response:** the same shape as a list item, **with** `exercises` (the full blueprint, V31 fields including `groupId` and `setDetail`). Returns 404 when the id is unknown.

#### `POST /v1/templates/certified/{id}/copy` · MISSING · P1

> ✅ **Done 23 Sep 2026.** As specified, including the three server rules: `PUT`/`DELETE` on a certified id → `403 CERTIFIED_READ_ONLY`, `apply` → `409 CERTIFIED_COPY_FIRST`, `copied_from_id … ON DELETE SET NULL`. `template.source` / `copied_from_*` are on every `TemplateResponse`. **Found and fixed by test:** V11's `updated_at` trigger fired on the `used_count` bump, so every copy read as stale immediately — `V12` guards the trigger; and staleness is compared at millisecond precision, since the frozen value travels as epoch ms.

- **Request:** `{ name?: string }`. The name is kept by default, with no "(copy)" suffix. **Response:** `TemplateWire` (201).
- **Behaviour:**
  - One transaction, blueprint copied **verbatim** (`groupId`, `setDetail`, `dayLabels`, `trainingDays`, `weeks`).
  - The copy gets `owner = caller`, `source = 'own'`, and `copiedFrom = {id, name, updatedAt}` taken **as at copy time**.
  - The copy increments `used_count`, and nothing else ever may.
- **Server rules:**
  - `PUT`/`DELETE /v1/templates/{id}` on a certified row → `403` with `detail`.
  - `POST /v1/templates/{id}/apply` on a certified row → `409` *"Copy this to your programs first …"*.
  - `copied_from_id` is `ON DELETE SET NULL`.

**Two corrections to the handoff:**
- **(a) Numbering.** It says "V37". The next migration is **V6**.
- **(b) Tenancy.** The handoff puts certified rows in `template`, owned by a service account. But `template.tenant_id` is **NOT NULL** with a tier-1 policy, so a certified row stamped with any one tenant is invisible to every other tenant.
  - Use a separate **`certified_template`** table under the **tier-3 catalogue** policy (`tenant_id IS NULL`, readable by every tenant, like the global `exercise` rows), written only by migration or an admin path.
  - Put `source` and `copied_from_id/_name/_updated_at` on `template`.
  - That also keeps certified rows out of `GET /v1/templates` by construction, and never out of RLS.
  - Relaxing `template.tenant_id` to nullable is the alternative, but it weakens a tier-1 invariant for the whole table.

### Workouts (workout templates)

> ✅ **Done 23 Sep 2026 — `V13__workout_template.sql`, all five routes.** Table exactly as specified (tier 1, stamp/freeze triggers, soft delete), blob stored in the wire's camelCase. Every normalisation rule below is implemented and tested, and `exerciseId`s — alternatives included — are checked against the caller's library (`400 VALIDATION` naming the position). Additions beyond the spec: `404 WORKOUT_NOT_FOUND` is typed; a dividers-only `PUT` clamps against the exercises already stored; ceilings (60 movements, 30 sets, 5 alternatives, 30 dividers, 120-char name, 500-char notes) are `400`s, not truncations; `setCount` does not count alternatives' sets. Tests: `WorkoutTemplateTest`, plus the tier-1 wall in `TenantIsolationTest`.

This is a new first-class object. A **workout template** is one reusable session, prescribed **per set**, with alternatives and headings. It is not a `template` with one week: `mock/types.ts` explains why, because a week-sheet row is *N × reps*, while a workout is a list of sets with a load kind and an effort kind each. The screen is `/programs/workouts`, and a program's day pulls from it (`components/programs/workout/LibraryPane.tsx`).

**Wire** (`lib/workouts/api.ts`):

```ts
interface WorkoutTemplateSetWire {
  loadKind: 'percent_1rm'|'level'|'weight'|'weight_range'|'bodyweight'|'rpe_level'|'rpe_weight';
  loadValue: number | null;
  effortKind: 'max_reps'|'max_time'|'max_distance'|'distance'|'reps'|'rep_interval'|'time';
  effortValue: number | null; restSeconds: number | null; tempo: string | null; notes: string | null;
}
interface WorkoutTemplateExerciseWire {
  id: string; exerciseId: string; orderIndex: number; groupId: string | null;
  alternatives?: { exerciseId: string; sets: WorkoutTemplateSetWire[] }[];
  sets: WorkoutTemplateSetWire[];
}
interface WorkoutTemplateWire {
  id: string; name: string; notes: string | null;
  exercises: WorkoutTemplateExerciseWire[]; dividers?: { label: string; beforeIndex: number }[];
  createdAt: number; updatedAt: number;
  exerciseCount: number; setCount: number;   // COUNTED on read, never stored
}
// POST / PUT body = WorkoutTemplateInput: { name, notes, dividers, exercises: {exerciseId, groupId, alternatives, sets}[] }
```

| Route | Pri | Behaviour (`mock/router.ts:1272–1279, 1645–1739, 2561–2599`) |
|---|---|---|
| `GET /v1/workout-templates` | **P0** | The caller's rows, with counts. An empty account gives `[]`. The shelf read is not lenient. |
| `GET /v1/workout-templates/{id}` | P1 | One row, or 404. Used when a workout is poured into a program day. |
| `POST /v1/workout-templates` → 201 | P1 | Create. `name` defaults to "New workout". |
| `PUT /v1/workout-templates/{id}` | P1 | **Whole-body replace** of the fields present (`name`, `notes`, `exercises`, `dividers`). There is deliberately **no per-exercise PATCH**, because two write granularities on one blob is how a half-saved session happens. |
| `DELETE /v1/workout-templates/{id}` → 204 | P1 | Hard in the mock. On the server, soft (`deleted_at`). Program rows are copies, carrying only a `workoutName`, so nothing cascades. |

**Normalisation the server must do** (the mock does it on write):
- **Exercises:**
  - `orderIndex` is **re-derived from array position** and never read.
  - `id` is kept, or minted when absent.
  - An unknown `loadKind` → `weight` and an unknown `effortKind` → `reps`. Numbers must be numbers, otherwise null. Empty `tempo` or `notes` → null.
  - An alternative with an empty `exerciseId` or zero sets is **dropped**.
- **Dividers:**
  - `beforeIndex` is rounded and **clamped** to `[0, exercises.length]`, evaluated **after** the exercises in the same body.
  - An empty label is dropped. Sorted by `beforeIndex`.
- **`exerciseId`:** the mock does not check it against the library. The server should refuse an id not visible under tier-3 RLS with `400 VALIDATION`.

**Authorization and migration.**
- **Authorization:** trainer-owned. Whether teams can read them, like `GET /v1/team/templates`, is a later call and not modelled.
- **Migration (V6):** `workout_template`:
  - `id uuid PK`, `trainer_id uuid NOT NULL`, `tenant_id uuid NOT NULL`;
  - `name varchar(120) NOT NULL`, `notes text`;
  - `exercises jsonb NOT NULL DEFAULT '[]'`, `dividers jsonb NOT NULL DEFAULT '[]'`;
  - `created_at`, `updated_at`, `deleted_at`;
  - the stamp and freeze tenant triggers, and a tier-1 policy.
- **Sync:** nothing enters sync, and no phone build notices.

### Assessments: check-ins (trainer side)

> ✅ **Done 23 Sep 2026 — `V14__assessment_questionnaire.sql`, all ten routes (plus `GET /v1/assessment-templates/{id}`).** Decisions applied, all the product owner's:
> - **Named *assessment* everywhere.** V5's `assessment` sitting table, `body_metric.assessment_id` and `GET`/`POST /v1/clients/{id}/assessments` were **removed from V5 before it shipped** (V5 rewritten, local DB reset), so the new tables take the plain names: **`assessment_template`** and **`assessment`** — not `checkin_*`. Routes are the mock's `/v1/assessments`, `/v1/assessment-templates`, `/v1/assessment-catalog`, so the web's call sites do not change.
> - **Timestamps stay ISO strings**, recorded in `API.md` as the one exception.
> - **The catalogue ships whole, health items included** (Vitals, visceral, `q_pain`, *Illness*), isolable in `AssessmentCatalogue`. **Three keys changed spelling:** `body_weight` → `weight`, `hips` → `hip`, `arm_right` → `arm` (V5's ids; `metric` now equals `key` on the shared six). **The web must read keys from `GET /v1/assessment-catalog`, not hard-code the mock's.**
> - Readings are **not** written to `body_metric`; `history` comes from returned assessments only.
>
> Beyond the spec: `name` is required on a template (`400 VALIDATION`); typed 404s `ASSESSMENT_NOT_FOUND` / `ASSESSMENT_TEMPLATE_NOT_FOUND`; `send:true` re-freezes the asked counts; `dueAt` also accepts `YYYY-MM-DD`; list `size` capped at 200. `assessment` already carries the tier-4 client policy the portal (module 11) will need. Tests: `AssessmentQuestionnaireTest`, and the wall in `TenantIsolationTest`.

**Read this with *Open questions* §1–§2 first.** The redesign's "assessment" is a **questionnaire check-in**: a trainer-authored template (measurements + questions), sent to a client, who answers it in the portal.
- **It is not V5.** V5's `assessment` table and `GET/POST /v1/clients/{id}/assessments` are a **measurement sitting** (`takenAt`, `note`, `readings` over six fixed metric ids). Nothing in the redesign calls the V5 routes.
- **New tables need new names:** `checkin_template` and `checkin`, never `assessment`. The routes keep the mock's `/v1/assessments` URLs only if the V5 routes stay under `/v1/clients/{id}/assessments`. They do not collide, but the words will confuse; consider `/v1/check-ins`, and change the four web call sites in one commit.

**Wire** (`lib/assessments/vocab.ts`, `detail.ts`). ⚠ **Timestamps are ISO strings** (`dueAt`, `sentAt`, `completedAt`, `readAt`, `createdAt`, `updatedAt`), unlike the epoch-ms convention of every other route. Keep them as the web reads them, or convert on both sides in one commit.

```ts
type AssessmentStatus = 'booked' | 'waiting' | 'missed' | 'done';   // DERIVED, never stored
interface QuestionWire { id; text; kind: 'yesno'|'rating'|'text'|'choice'; scale: 5|10|20|null;
                         options: {id; text}[]; allowMultiple: boolean; allowCustom: boolean }
interface TemplateWire { id; name; description: string|null;
                         measurements: {on: boolean; keys: string[]}; questions: {on: boolean; items: QuestionWire[]};
                         createdAt: string; updatedAt: string }
interface AssessmentWire { id; clientId; templateId: string|null; name; dueAt; sentAt|null; completedAt|null; readAt|null;
                           status: AssessmentStatus; unread: boolean;
                           measurements: {got; asked}; questions: {got; asked} }       // list rows: NO readings/answers
interface AssessmentDetailWire extends AssessmentWire {
  client: {id; name; status} | null; template: {id; name; description} | null;
  asked: { measurements: {key; label; group; unit}[]; questions: QuestionWire[] };
  readings: (MeasurementWire & { value: number })[];
  answers: { questionId; text; kind; scale; options; allowMultiple; yes; rating; answer: string|null; optionIds; chosen: string[] }[];
  history: { key: string; points: { assessmentId; at: string; value: number }[] }[];   // every RETURNED check-in, oldest first by completedAt
  returned: { id; name; at: string }[];                                                  // newest first
}
interface CatalogWire { groups: string[]; measurements: {key; label; group; unit; metric: string|null}[]; questions: QuestionWire[] }
```

**Status derivation** (`mock/router.ts:757–783`, **server-side only**):
- `completedAt` set → `done`.
- Else no `sentAt` → `booked`.
- Else `dueAt < now` → `missed`, otherwise `waiting`.
- `unread = status === 'done' && readAt === null`, and is false in every other state.

| Route | Pri | Behaviour |
|---|---|---|
| `GET /v1/assessments?status=a,b&read=unread\|read&clientId=&q=&page=&size=` | **P0** | Answers `{items, total}`. `status` is a **CSV set**; unknown names are ignored, never an empty screen. `read=read` means `done` and not unread. `q` matches the check-in name **or** the client's name. `total` is counted **after** filters. `page` defaults to 0 and `size` to 20. The web also calls it with `size=1` for the grand total, and with `clientId&size=200` on `/clients/:id/assessments`. Ordering is `dueAt` desc, then `id` (total order). Readings and answers are **stripped** from list rows. |
| `GET /v1/assessments/{id}` | **P0** | `AssessmentDetailWire`, joined on the server (`assessmentDetail`, `:812–899`). Each question is looked up in the **template** first and the bank second, and a question in neither is **dropped**. `history` is built from returned check-ins **only**, never from `body_metric`. |
| `POST /v1/assessments` → 201 | P1 | Body: `{clientId, templateId, dueAt: ISO, sendNow: boolean}`. Unknown client → `400 VALIDATION "clientId: no such client"`; unknown template → `400 VALIDATION "templateId: no such assessment"`. `sendNow === false` means `sentAt = null`, i.e. booked. `name` defaults to the template's name. The asked counts are frozen from the template **at send time**. Returns a list-row view. |
| `PATCH /v1/assessments/{id}` | P1 | `{read?: boolean, dueAt?: ISO, send?: true}`. `read:false` really un-reads, which is intended. `send:true` stamps `sentAt` only if it is unset. |
| `DELETE /v1/assessments/{id}` → 204 | P1 | The mock deletes the row hard. The server should soft-delete it, because it may hold client-written answers (see *Open questions*). |
| `GET /v1/assessment-templates` | **P0** | The caller's templates. The templates page's read is not lenient. |
| `POST /v1/assessment-templates` → 201 | P1 | The web checks the name (required, ≤ 120). The server must validate the same. Normalisation is below. |
| `PUT /v1/assessment-templates/{id}` | P1 | Whole-block replace of the fields present, with no per-question PATCH. |
| `DELETE /v1/assessment-templates/{id}` → 204 | P1 | The check-ins already sent **survive**, with `template_id` set to NULL (`ON DELETE SET NULL`), because a sent check-in is a copy. |
| `GET /v1/assessment-catalog` | P1 | The product's catalogue, not the trainer's, and never emptied for a new account. The web tolerates null, but then the editor has nothing to pick from. |

**Template normalisation** (`readQuestions`, `readStringList`, `readBlockOn`; `mock/router.ts:909–986`):
- **Blocks:** a block arrives as `{on, keys|items}` or as a bare array. A missing `on` counts as **on**.
- **Measurement keys:** filtered to catalogue keys, and de-duplicated preserving order.
- **Questions:**
  - An unknown `kind` → `text`.
  - `scale` is kept only for `rating`, and must be in {5, 10, 20}, otherwise 10.
  - `options`, `allowMultiple` and `allowCustom` are **forced empty or false unless** `kind === 'choice'`.
  - Missing ids are minted.

**Authorization and migration.**
- **Authorization:** trainer-owned, in the active workspace. The client reads and answers through `/v1/me/assessments*` only (§Portal).
- **Migration (V6):**
  - `checkin_template`: `id`, `trainer_id`, `tenant_id NOT NULL`, `name varchar(120)`, `description text`, `measurements jsonb`, `questions jsonb`, timestamps, `deleted_at`.
  - `checkin`: `id`, `client_id`, `trainer_id`, `tenant_id NOT NULL`, `template_id NULL REFERENCES checkin_template ON DELETE SET NULL`, `name`, `due_at timestamptz`, `sent_at`, `completed_at`, `read_at`, `measurements_asked int`, `questions_asked int`, `readings jsonb`, `answers jsonb`, timestamps, `deleted_at`.
  - Both get tier-1 staff policies, and `checkin` also gets a `*_client` policy for the portal.
- **Catalogue storage:** in code, like `MetricCatalogue`, not in a table.
- **Sync:** nothing enters sync.

### Notifications (the trainer's bell)

#### `GET /v1/notifications` · `POST /v1/notifications/{id}/read` · `POST /v1/notifications/read` · MISSING · P2

> ✅ **Done 23 Sep 2026 — `V15__trainer_notification.sql`.** Table as specified (tier 1 for read and mark; **no INSERT policy**), 90-day feed, no push, all three routes with the stated semantics. **One write path:** `mint_trainer_notification()`, `SECURITY DEFINER`, which stamps the row with the workspace of the client it is about — needed because every producer is somebody other than the recipient (a teammate admin now, a client in the portal next). **Producers wired now: `team` only** — the coach who LOSES a client on reassignment gets `{kind:'team', text:<new coach's name>}`, and only when somebody else made the move. `metric` lands with the portal (module 11); `cancelled` and `payment` still have no producer, as the spec says. Tests: `TrainerNotificationTest`, `TeamReassignTest`, `TenantIsolationTest`.

- **Current failure.** `lib/notifications/api.ts` swallows every failure into `[]`, so the bell is empty rather than broken.
- **Wire:** `{ id, kind: 'payment'|'cancelled'|'metric'|'team', clientId|null, clientName|null, amount|null, subjectAt|null, text|null, at: number, readAt|null }`.
- **Rows are facts, never sentences** (`lib/notifications/copy.ts` writes the line).
  - A kind the build does not know is dropped client-side.
  - `payment.text` is the method, or `'gym'`.
  - `cancelled.subjectAt` is the slot and `text` is the day label.
  - `metric.text` is `"<value> <unit>"`.
- **Behaviour** (`mock/router.ts:1378, 3015–3038`):
  - `GET` returns the whole feed, newest first, with **no `?unread`**, because the header counts what the list holds.
  - Mark-one is **idempotent and never un-reads**, since `readAt` is when the row was first seen. It answers with the row, or `404`.
  - Mark-all is **one** request that stamps every null `readAt` and answers with the feed.
  - There is no route that marks a row unread.
- **Producers** (none exist, and this is the real work):
  - `metric`: a client's `POST /v1/me/metrics` (`mock/portal.ts:1093`).
  - `cancelled`: a client-side cancel. The portal has none yet, so this kind stays empty.
  - `payment`: a payment recorded by somebody other than this trainer (the gym admin, Ring 2).
  - `team`: `reassign` and membership changes.
  - The bell holds only **events somebody else did**, never the trainer's own writes (`AGENTS.md` *the bell holds EVENTS*).
- **Migration (V6):** `trainer_notification`: `id`, `trainer_id`, `tenant_id NOT NULL`, `kind varchar(16)`, `client_id NULL`, `amount numeric NULL`, `subject_at timestamptz NULL`, `text varchar(120) NULL`, `at timestamptz`, `read_at timestamptz NULL`. It gets a tier-1 policy, is capped by retention (for example 90 days), and **no push** is sent.
- **Rule touched.** *A notification never carries a verb that changes the book.* A team `payment` row must be totals-free for a coach, because no role sees a teammate's money book.


---

## Portal `/v1/me/*`

*Supersedes `BACKEND_GAPS.md` → "The client portal has no REST surface at all". Measured 23 Sep 2026 against the mock repo at HEAD (`0975f18`) and the backend at `V5`.*

**Where things stand.** `grep -rn '/v1/me' backend/src/main/java` finds nothing. The backend's whole client-facing API is `GET /v1/client/sync/pull` + `POST /v1/client/sync/push` (`sync/ClientSyncController.java`), both taking a **required** `?clientId=` that `ClientSyncService.resolve(phone, clientId)` (`:69`) checks against the token's phone. The spec is the mock: `mock-ui/web/mock/portal.ts` (the router, 1,839 lines) and `mock-ui/web/lib/portal/api.ts` (the wire types). Paths below are relative to `mock-ui/web/` unless they start with `backend/`.

**Since the port (`git diff b65d56f`)** the mock gained **check-ins**: four `/v1/me/assessments*` routes, `lib/portal/checkin.ts`, `components/portal/checkin/Flow.tsx`, and `/me/checkin/[assessmentId]` plus `/me/progress/assessments`. It also added `lib/portal/training.ts`, which derives the Exercises tab from `GET /v1/me/sets` and needs no new route. The web tree is being overwritten from the mock as this is written (its working-tree `lib/portal/api.ts` gained the four `/assessments` calls during this pass), so treat the mock, not the web tree, as the caller list.

> ✅ **Module 11a done 23 Sep 2026 — `V16__portal_reads.sql`, all 15 P0 reads plus `GET /v1/me/exercises`.** New tables `client_message` and `milestone`; three narrow client-lens READ policies (`pack` — only a pack a package of theirs was sold from; `client_note` — only notes marked `shared_with_client`; `assessment_template` — only one a SENT assessment came from). Roster resolution as specified (`NOT_A_CLIENT` / `NOT_YOURS`, deterministic default: newest `accepted_at`). **Built to the real backend, not the mock, in five places:** (1) the plan's days are keyed by the client's **slots**, mapped back from the copy's weekdays through `program.schedule`, so they agree with `scheduled_session.template_day` (§3's wrinkle); a multi-week plan shows the current week; (2) past plans count workouts by `program_id`, null when there is no record; (3) `GET /v1/me/program` returns a literal JSON `null`; (4) `prefs` are the defaults until 11d stores them; `workouts[].effort` and `workout.feedback` are null until 11b; (5) packages add `pausedAt`. `GET /v1/me` returns `health` read-only from `client.metadata`. Tests: `PortalReadTest`, and the client lens in `TenantIsolationTest`.

### Endpoint table

"Called" means some `lib/portal/*` function makes the request **and** a screen or action reaches that function. Every route is **MISSING** (404 today).

| # | Method | Path | lib function (file) | Screen(s) | Status | Pri |
|---|---|---|---|---|---|---|
| 1 | GET | `/v1/me` | `getMe` (api.ts:403), via `requirePortal` (guard.ts) | `app/(portal)/me/layout.tsx` (every portal route), `PortalShell`, progress layout, `deleteMyAccount` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 2 | PATCH | `/v1/me` | `patchMe` → `correctMyDetails` (actions.ts:276) | `MyDetails` (`/me/account/settings`) | ✅ DONE (11e, 23 Sep) | ~~P2~~ |
| 3 | DELETE | `/v1/me` | `deleteMe` → `deleteMyAccount` (actions.ts:439) | `DataRights` (`/me/account/privacy`) | ✅ DONE (11e, 23 Sep) | ~~P1~~ |
| 4 | GET | `/v1/me/sessions?from&to` | `getPortalSessions` | `Home` (`/me/today`), `PlanSchedule`, `PlanWorkouts`, `PlanDay`, `ProgressSummary`, `ProgressHistory` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 5 | GET | `/v1/me/program` | `getPortalProgram` (+ `resolveNames`) | `Home`, plan layout, `PlanSchedule`, `PlanWorkouts`, `PlanDay`, `PlanHistory`, `ProgressSummary` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 6 | GET | `/v1/me/programs` | `getPortalPrograms` | plan layout (tab count), `PlanHistory` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 7 | GET | `/v1/me/programs/{id}` | `getPortalProgramById` | `PastPlan` (`/me/plan/history/[programId]`) | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 8 | GET | `/v1/me/workouts?limit` | `getPortalWorkouts` | `Home`, `ProgressSummary`, `ProgressHistory`, `ProgressExercises`, `ExerciseDetail` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 9 | GET | `/v1/me/workouts/{id}` | `getPortalWorkout` | `workout/Flow` (`/me/workout/[workoutId]`) | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 10 | POST | `/v1/me/workouts` | `postWorkout` → `startWorkout` | `StartButton` (on `Home`) | ✅ DONE (11b, 23 Sep) | ~~P1~~ |
| 11 | POST | `/v1/me/workouts/{id}/sets` | `postSet` → `saveSet` | `workout/Flow` | ✅ DONE (11b, 23 Sep) | ~~P1~~ |
| 12 | POST | `/v1/me/workouts/{id}/swap` | `postSwap` → `swapExercise` | `workout/Flow` | ✅ DONE (11b, 23 Sep) | ~~P1~~ |
| 13 | POST | `/v1/me/workouts/{id}/finish` | `postFinish` → `finishWorkout` | `workout/Flow`, `workout/Done` | ✅ DONE (11b, 23 Sep) | ~~P1~~ |
| 14 | GET | `/v1/me/sets` | `getPortalSets` (feeds `training.ts`, `exercises.ts`, `progress.ts`) | `Home`, `ProgressSummary`, `ProgressExercises`, `ExerciseDetail` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 15 | GET | `/v1/me/metrics` | `getPortalMetrics` | `Home`, `ProgressAssessments` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 16 | POST | `/v1/me/metrics` | `postMetric` → `logWeight` | `QuickLog` (on `Home`) | ✅ DONE (11c, 23 Sep) | ~~P1~~ |
| 17 | GET | `/v1/me/exercises?ids=` | `getPortalExerciseNames` via `resolveNames` (names.ts) | `ProgressSummary`, `ProgressExercises`, `ExerciseDetail`. Called only for ids the program cannot name | ✅ DONE (11a, 23 Sep) | ~~P1~~ |
| 18 | GET | `/v1/me/packages` | `getPortalPackages` | account layout, `AccountMe`, `Home` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 19 | GET | `/v1/me/payments` | `getPortalPayments` | `AccountMe` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 20 | GET | `/v1/me/messages` | `getPortalMessages` | `Home`, `AccountMe` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 21 | GET | `/v1/me/milestones` | `getPortalMilestones` | `Home`, `ProgressSummary`, `ProgressHistory` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 22 | GET | `/v1/me/notifications` | `getPortalNotifications` (swallows every failure into `[]`) | `me/layout.tsx` → `PortalShell` bell | ✅ DONE (11d, 23 Sep) | ~~P1~~ |
| 23 | POST | `/v1/me/notifications/{id}/read` | `postNotificationRead` → `markNotificationRead` | `PortalShell` | ✅ DONE (11d, 23 Sep) | ~~P2~~ |
| 24 | POST | `/v1/me/notifications/read` | `postNotificationsReadAll` → `markNotificationsRead` | `PortalShell` | ✅ DONE (11d, 23 Sep) | ~~P2~~ |
| 25 | GET | `/v1/me/assessments` | `getPortalCheckIns` *(mock only)* | `Home`, `ProgressAssessments` | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 26 | GET | `/v1/me/assessments/{id}` | `getPortalCheckIn` *(mock only)* | `checkin/Flow` (`/me/checkin/[assessmentId]`) | ✅ DONE (11a, 23 Sep) | ~~P0~~ |
| 27 | POST | `/v1/me/assessments/{id}/answers` | `postCheckInAnswer` → `saveCheckInAnswer` / `clearCheckInAnswer` | `checkin/Flow` | ✅ DONE (11c, 23 Sep) | ~~P1~~ |
| 28 | POST | `/v1/me/assessments/{id}/submit` | `postCheckInSubmit` → `submitCheckIn` | `checkin/Flow` | ✅ DONE (11c, 23 Sep) | ~~P1~~ |
| 29 | GET | `/v1/me/export` | `getPortalExport` → `downloadMyData` | `DataRights` | ✅ DONE (11e, 23 Sep) | ~~P1~~ |
| 30 | PATCH | `/v1/me/prefs` | `patchPrefs` → `setHideWeight`, `setNotify`, `setNominee` | `MyDetails`, `Home`, `NotifySwitches`, `Nominee` | ✅ DONE (11d, 23 Sep) | ~~P1~~ |
| 31 | POST | `/v1/me/phone/challenge` | `challengeMyPhone` → `startMyPhoneChange` | `MyDetails` | ✅ DONE (11e, 23 Sep) | ~~P1~~ |
| 32 | POST | `/v1/me/phone/verify` | `verifyMyPhone` → `verifyMyCurrentNumber` | `MyDetails` | ✅ DONE (11e, 23 Sep) | ~~P1~~ |
| 33 | POST | `/v1/me/phone/request` | `requestMyNewPhone` → `requestMyNewNumber` | `MyDetails` | ✅ DONE (11e, 23 Sep) | ~~P1~~ |
| 34 | POST | `/v1/me/phone/confirm` | `confirmMyNewPhone` → `confirmMyPhoneChange` | `MyDetails` | ✅ DONE (11e, 23 Sep) | ~~P1~~ |

**Totals: 34 called routes. 15 are P0, 17 P1 and 2 P2.** PATCH `/v1/me` is counted P2 only because its one field is forbidden (see *Open questions*).

**Defined but not called, so do not build them yet.**
- `POST /v1/me/messages/{id}/read`: `postMessageRead` (api.ts:767) is wrapped by `markMessageRead`, and nothing imports that.
- `GET /v1/me/sets?exerciseId=`: the router honours it (`portal.ts:756`), but `getPortalSets` never sends it.
- `PUT` as an alias of `PATCH` on `/v1/me` and `/v1/me/prefs`: the router accepts it, no caller sends it.

**Why the reads are P0.** Every portal route runs `requirePortal()` → `getMe()` in the layout, so while `GET /v1/me` is missing **every** `/me/*` route redirects before anything else is fetched. Each page then `Promise.all`s its reads, and every read except the bell throws. One missing P0 read therefore takes its whole page to `Unavailable`.

### Cross-cutting: authorization and roster resolution (applies to every route)

- **Caller.** Only a client-role JWT is accepted, and its subject is the **phone** (`backend/.../auth/JwtService.java:89`). `AuthTokenFilter.tenantContextFor` (`:110`) already builds a client `TenantContext`: `app.client_ids` holds every live `client` row for that phone across all rosters, and `app.tenant_ids` holds their workspaces. So the Tier-4 `*_client` RLS policies are live for these routes with no further work.
- **Which roster.** `lib/portal/api.ts:92` appends `?clientId=<inclineyou_client cookie>` to **every** request, reads and writes alike, and **only when the cookie exists**. The mock (`portal.ts:167`) resolves it like this:
  - no token → `401 UNAUTHORISED`;
  - no `client` row for the phone (last 10 digits) → `403 NOT_A_CLIENT`;
  - `clientId` present but not one of this phone's rows → `403 NOT_YOURS`;
  - `clientId` absent → **the first matching row**.

  Build it as `ClientSyncService.resolve` with two changes:
  - `clientId` must be **optional**, because `/sign-in/role` deliberately writes no cookie for a single-roster client.
  - The no-cookie default must be **deterministic**. Pick the single live row, or else the newest `accepted_at`. Never "first row", because `ORDER BY` with ties returns any order (trap 29).

  Keep `resolve`'s filters: `deleted_at IS NULL`, and the trainer is not deleted.
- **Error shape.** The web reads `{ code, detail }` off the body (api.ts:122–134) and shows `detail` to the client for the swap, closed-log, phone and check-in refusals. **These routes need typed exceptions and a handler** in the `PackRuleException` pattern. A bare `ResponseStatusException` loses the sentence (trap 31).
- **Not-yours is 404, not 403**, on every `{id}` route (programs, workouts, notifications, messages, assessments). It must not confirm that somebody else's row exists.
- **Tenancy.** Every new table below carries `tenant_id uuid NOT NULL` with `trg_*_stamp_tenant` / `trg_*_freeze_tenant` triggers, RLS enabled, and two policies: a `*_tenant` policy for staff and a `*_client` policy (`client_id = ANY(app_client_ids())`). **The staff policy is omitted where the trainer must not read the table** (`client_prefs`). A client write stamps the **roster's** tenant. `stamp_tenant_id()` reads `app.tenant_id`, which for a client is `tenantIds.getFirst()` (AuthTokenFilter:117), **so a client on two rosters would stamp the wrong tenant**. Client writes must set `tenant_id` explicitly from the resolved `client.tenant_id`.
- **Migration numbering.** The next free migration is **V6**. Group all the portal tables into one V6 (or V6–V8). Everything is additive, nothing enters sync, so no phone notices.

### 1. `GET /v1/me` · `PATCH /v1/me` · `DELETE /v1/me`

> ✅ **All three done** (`GET` 11a; `PATCH` and `DELETE` 11e, 23 Sep 2026). **`PATCH /v1/me` accepts `health` only** — stored in `client.metadata.health` by the product owner's decision to include health data now and strip it later if required; **`phone` is refused** (the two-code ladder in §10 is the only way a number moves). **`DELETE /v1/me` is a membership exit** as decided: the typed number is re-checked server-side (`400 DELETE_NOT_CONFIRMED`); this roster's client row, prefs (nominee erased), bell, assessments, workout feedback and future bookings are soft-deleted; payments, packages, logged workouts, past sessions and the trainer's notes are kept; other rosters untouched. That resolves the FK and private-note collisions *Open questions* §3/§6 list, because nothing is hard-deleted.

**GET** (`portal.ts:592`) returns `MeWire` (api.ts:147):
```ts
{ client: { id, name, phone, goal, membershipStatus, deliveryMode, sessionsPerWeek,
            sessionDurationMinutes, weeklySchedule: {templateDay,weekday,time}[]|null,
            startedAt: number /* client.created_at, epoch ms */, health: string /* metadata.health, '' */ },
  trainer: { id, name, phone, gymName, headline, mapLink },       // trainerView(), nothing more
  rosters: { clientId, clientName, trainerName }[],               // every live row on this phone
  prefs: PrefsWire }                                              // defaults when no client_prefs row
```
- `PrefsWire` is `{ clientId, hideWeight, notify: {programUpdated, sessionReminder, trainerNote, personalBest, packChanged}, nominee: {name, phone}|null }`.
- When no row exists the defaults are `hideWeight:false`, every switch **on**, and `nominee:null`.
- The mock gives every roster the **same** trainer name (single-trainer store). The real `rosters[].trainerName` must join each row's own trainer.
- **`trainer` must be the resolved roster's trainer**, not "the" trainer.
- **`trainer.phone` is deliberately exposed**, because the portal's WhatsApp links need it.
- `startedAt` is the arrangement start. `client.accepted_at ?? created_at` is the honest mapping.
- Everything maps onto existing `client` / `trainer` columns **except `health`** (see open questions) **and `prefs`** (new table, §9).

**PATCH** (`portal.ts:1383`)
- Body: `{ phone?: string; health?: string }`. Response: `{ id, phone, health }`.
- A `phone` that is not 10 digits → `400 VALIDATION`. `health` is written into `client.metadata.health`.
- **The web only ever sends `health`** (actions.ts:277).
- **Do not accept `phone` here.** The mock writes it with no OTP, which bypasses the two-code ladder in §10. The ladder's own comment calls a one-field number change "an account moved to a stranger with no way back".
- With `health` refused and `phone` removed, this route has **no legitimate field**. Build it only if some non-health correction is agreed.

**DELETE** (`portal.ts:1773`)
- No body. Answers **204**, and the web then clears its cookies and redirects to `/sign-in?left=1`.
- **The typed-number confirmation is checked only in the Next server action** (actions.ts:446), not by the mock backend. The backend should take `{ confirmation: string }` and match the last 10 digits against the resolved `client.phone`, as `AccountService` does for the trainer.
- **The mock hard-deletes** every row keyed to that `clientId`: sets, workout_exercises, feedback, workouts, program_exercises, programs, sessions, body_metrics, **packages**, **the trainer's private notes**, client_messages, milestones, client_prefs, attention dismissals, the trainer's notifications about them, client_notifications, **assessments**, and finally the `client` row.
- It **keeps `payment` rows with `clientId` blanked**.
- Other rosters on the same phone are untouched: it deletes the membership, not the human.
- This collides with several backend rules; see open questions.

### 2. `GET /v1/me/sessions?from&to`

- `portal.ts:633`. `from` and `to` are epoch ms, **half-open** `[from, to)`. The mock defaults each missing bound to ±∞, but the web always sends both.
- Callers use 90 days back / 28 days forward (`PORTAL_LOOKBACK_DAYS`, `PORTAL_LOOKAHEAD_DAYS`), or `startedAt − 1d … now + 1d` on Progress.
- Sorted `scheduledAt ASC`.
- Response: `{ id, scheduledAt, durationMinutes, status, dayLabel, templateDay, deliveryMode, location, workoutId }[]`.
- `location` is `null` for remote sessions, otherwise `trainer.gym_name`.
- `workoutId` is the `workout_session` whose `scheduled_session_id` matches.
- Every field exists on `scheduled_session` + `workout_session`, and `scheduled_session_client` RLS already scopes it. **No migration.**
- **Withhold** `pack_delta`, `pack_package_id` and anything else about money on a session.

### 3. `GET /v1/me/program` · `/v1/me/programs` · `/v1/me/programs/{id}`

`/program` (`portal.ts:674`)
- Returns the client's `status='active'` program as `PortalProgramWire`, or **`null`** (a 200 with a null body, not a 404) when none is assigned.
- **Caveat:** the trainer half documents that `apply` never ends the old program, so two `active` rows can exist. Pick deterministically, e.g. newest `created_at`, and document the choice.

`/programs` (`:680`)
- Every **non-active** program, `created_at DESC`, as summaries:
  `{ id, name, goal, startDate, endDate, weeks, status, trainingDays, dayCount, exerciseCount, workoutCount: number|null }`.
- `workoutCount` is **null whenever the block ended before the oldest workout on record**, never 0 (`programSummary`, `:304`). Otherwise it counts workouts whose `session_date` falls in `[startDate, endDate]`.
- **No adherence figure, by rule.**

`/programs/{id}` (`:749`)
- Returns the same `programView` as `/program`, live or finished.
- Not this client's → `404 NOT_FOUND "That plan is not here."`

`PortalProgramWire` (`programView`, `:240`):
```ts
{ id, name, goal, startDate, endDate, weeks, status,
  week: number|null,   // active only: floor((today-startDate)/7)+1 clamped to [1,weeks]; null on non-active
  dayLabels: Record<string,string>, trainingDays: number[],
  days: { templateDay, label /* dayLabels[d] ?? `Day ${d}` */,
          exercises: { exercise: PortalExerciseWire|null, sets, reps, targetLoad, restSeconds }[] }[] }
PortalExerciseWire = { id, name, muscleGroup, equipment, logType, cue /* program_exercise.notes */,
                       formCues: string[], steps /* exercise.description */ }   // NO clip — removed by product decision
```
- Rows are ordered `day_of_week, order_index`, and a day's exercises are the rows where `day_of_week == templateDay`.
- **Real-backend wrinkle:** since V2, `copyBlueprintInto` translates slots into **weekdays** through `program.schedule`. So on a real copy `day_of_week` is a weekday, while the mock's `trainingDays` are template slots. The server must produce `days[]` keyed consistently with `trainingDays`/`dayLabels` as V2 re-keys them, and consistently with `scheduled_session.template_day`, which `PlanDay` links through. Check this against a real response (trap 28).
- **Library reads:**
  - `logType` is not on the backend's `ExerciseResponse` today (the console infers it), and `formCues` has to come from the catalogue.
  - **RLS reads fine:** `exercise_catalogue` allows `tenant_id IS NULL OR = ANY(app_tenant_ids())`, and a client's `tenant_ids` holds its rosters' workspaces, so a trainer's custom exercises resolve.
  - `program_client` and `program_exercise_client` already exist. **No migration.**

### 4. Workouts: `GET /v1/me/workouts` · `GET /v1/me/workouts/{id}` · `POST /v1/me/workouts` · `…/sets` · `…/swap` · `…/finish`

> ✅ **11b done 23 Sep 2026 — `V17__portal_workouts.sql`** (`workout_feedback`; `milestone_client_insert`). Start / set / swap / finish as specified, with the backend corrections this section asks for: a foreign session is **404**, a cancelled one **409 SESSION_CANCELLED**; a set must be against a **live card** in the log; every client insert sets `tenant_id` from the resolved client row. **Finish does NOT mark the session or charge the pack** (decided 23 Sep — *Open questions* §7), so the double-charge race cannot arise. **One adjustment:** the milestone counts **finished workouts**, not `done` sessions — since a client's finish no longer marks a session done, counting sessions would mean the client's own logging never reached a milestone. The `best` client notification from `/finish` lands with 11d. A no-session start seeds today's weekday's plan rows. Tests: `PortalWorkoutTest`, and the client writes in `TenantIsolationTest`.

**List** (`:722`)
- `created_at DESC`, with an optional `?limit`.
- Response: `{ id, sessionDate, startedAt /* created_at */, endedAt, setCount, volumeKg /* round Σ load×reps */, exerciseCount /* distinct exercise ids with a set */, effort: 'easy'|'right'|'hard'|null }[]`.
- **Unwindowed.**

**One workout** (`:749`, `workoutView` `:381`) returns `PortalWorkoutWire`:
```ts
{ id, sessionDate, startedAt, endedAt, dayLabel, programName, deliveryMode, scheduledAt, notes,
  feedback: { effort, note, at } | null,
  exercises: { exercise: PortalExerciseWire|null, targetSets, targetReps, targetLoad, restSeconds,
               swappedFromExerciseId, alternative: PortalExerciseWire|null,
               sets: { id, setNumber, loadKg, reps, rpe }[],
               lastTime: { sessionDate, sets:{setNumber,loadKg,reps}[], bestLoadKg, bestReps } | null }[] }
```
- `exercises` come from `workout_exercise` rows with `removed_at IS NULL`, ordered by `order_index`.
- `cue`, `targetLoad` and `alternative` come from the program row with the same `exercise_id` (and the session's `template_day`, when set).
- `alternative` is `program_exercise.alt_exercise_id`.
- `lastTime` is the **last session's** sets for that movement plus the all-time best (`lastTimeFor`, `:357`).
- 404 → `NOT_FOUND "No such workout."`
- **Real-backend wrinkle:** `set_log` has no `client_id` or `session_date`, so join through `workout_session`.

**Start** (`POST /v1/me/workouts`, `:1108`)
- Body: `{ sessionId?: string }`.
- **Resume before create.** If an open workout (`ended_at IS NULL`) exists for that `sessionId` (or, with no session, for today's date), it is returned with a **200**.
- A session that is not the client's → `403 NOT_YOURS`. That should be 404 by the rule above.
- Otherwise the mock inserts a `workout_session`:
  - `program_id` = the active program;
  - `scheduled_session_id` = the session;
  - `session_date` = the session's date (or today);
  - `logged_by` should be the client, and the column exists.
- It copies the active program's rows for the session's `template_day` into `workout_exercise` (`source='program'`, `target_sets`, `target_reps` and `rest_seconds` copied).
- No program means no exercises.
- Answers **201** with the `workoutView`.
- **The mock does not check** that the session is today or still scheduled, so the backend should refuse a cancelled session.

**Set** (`…/sets`, `:1176`)
- Body: `{ exerciseId, setNumber, loadKg: number|null, reps: number|null }`. Response: `{ id, setNumber, loadKg, reps, rpe }`, with **201** on insert and 200 on update.
- **Upsert on `(workout, exercise, setNumber)`**, so tapping twice cannot create a duplicate set.
- Refusals:
  - closed workout → `409 WORKOUT_CLOSED "That workout is finished."`
  - unknown exercise → `400 VALIDATION`
  - not the client's → 404.
- The mock accepts **any catalogue exercise**, not only those in the workout. The backend should require a live `workout_exercise` row.
- `rpe` is always null from the portal.

**Swap** (`…/swap`, `:1225`)
- Body: `{ exerciseId, toExerciseId }`. Response: the full `workoutView`.
- Movement not in the workout → `404 NOT_FOUND`.
- `toExerciseId` must equal the program row's `alt_exercise_id`, else `422 NOT_APPROVED "Your trainer has not set that as an alternative for this movement."`
- Any set already logged against `exerciseId` in this workout → `409 ALREADY_STARTED`.
- On success it sets `swapped_from_exercise_id = from` and `exercise_id = to`, keeps `target_sets`, and sets `target_reps` from the program row.

**Finish** (`…/finish`, `:1291`)
- Body: `{ effort?: 'easy'|'right'|'hard'; note?: string|null }`. Response: `workoutView`.
- **Idempotent.** Only the first call closes the workout.
- On the first call:
  1. Set `ended_at = now`.
  2. **If the linked `scheduled_session` is `scheduled`, set it to `done` with `pack_delta = -1` and decrement `sessions_remaining` on the client's active pack** (the trainer console's `packDelta` rule).
  3. Count all `done` sessions. On every 25th, insert a `milestone` (`kind:'sessions'`, label ``${n}th session with ${trainerFirstName}``, `value:n`) and mint a `best` client notification, gated by prefs.
- Effort feedback is upserted into `workout_feedback` (one row per workout) on **every** call.
- **Backend conflicts in step 2:**
  - The mock picks the **first** active pack it finds. The real rule spends **oldest first** (`markDone`: `ORDER BY created_at ASC`) and **skips paused packs** (`paused_at`).
  - The real `markDone` also stamps `pack_package_id` / `pack_applied_at` for the 24-hour undo.
  - Reuse `ScheduledSessionService.markDone`'s predicate and stamping; do not reimplement it.
  - **This is the first client write that moves money**, which contradicts `ClientSyncService.confirmSessions`' stated rule that *"a client cannot move, cancel or no-show a session"* (see open questions).

**Migration (V6).** `workout_feedback`:
```sql
workout_feedback(id uuid pk, workout_session_id uuid not null unique fk, client_id uuid not null fk,
                 effort varchar check (effort in ('easy','right','hard')), note text,
                 at timestamptz not null, created_at, updated_at, deleted_at, tenant_id uuid not null)
```
- RLS: client read and write on its own rows; staff read.
- It is the client's own answer, and the trainer cannot edit it.
- Everything else uses existing tables, whose `*_client` policies already allow writes.

### 5. `GET /v1/me/sets` · `GET /v1/me/exercises?ids=`

`/sets` (`:756`)
- **Unwindowed on purpose**: a personal best is a claim about the whole history.
- `created_at ASC`. Response: `{ exerciseId, setNumber, loadKg, reps, sessionDate, createdAt }[]`.
- Needs a join through `workout_session` for `session_date` and `client_id`, and should exclude soft-deleted sets and workouts.
- The mock's own note prices this at ~430 rows after 14 months. If that bites, the fix is a per-exercise projection, not a window.

`/exercises` (`:803`)
- Takes comma-separated ids and returns `PortalExerciseWire[]` with `cue: null`.
- **Narrowed to ids that appear in this client's own set logs**, so the route cannot be walked to enumerate the library. Unknown and unlogged ids are silently dropped. An empty `ids` returns `[]`.
- Called only for lifts the current program no longer names (`lib/portal/names.ts`).

### 6. `GET /v1/me/metrics` · `POST /v1/me/metrics`

> ✅ **`POST` done 23 Sep 2026 (11c, no migration).** Restricted to **V5's six ids** with their typo guard, stored in the catalogue's unit, `assessment_id`-free (a loose reading — that column no longer exists), `tenant_id` from the resolved client row. The side effect lands: a `metric` row on the trainer's bell via `mint_trainer_notification()` (V15). `hideWeight` never refuses it. Test: `PortalClientWriteTest`.

**GET** (`:822`)
- `recorded_at ASC`. Response: `{ id, metricType, value, unit, recordedAt }[]`.
- Every body-metric row, **unwindowed**.
- `body_metric_client` RLS exists.
- Honour `deleted_at`: V5 corrections are a soft delete plus a new row.

**POST** (`:1074`)
- Body: `{ metricType, value, unit? }`. The web only sends `('weight', x.x, 'kg')` from `QuickLog`.
- `value <= 0` → `400 VALIDATION`.
- The default unit is `kg`, `%` or `cm` by type.
- Answers **201** with the row.
- Side effect: it unshifts a **trainer** notification of kind `metric` with text ``${value} ${unit}``.
- **Backend rules it touches:**
  - The mock accepts **any `metricType` string**. V5 fixes the ids at six (`weight · body_fat · chest · waist · hip · arm`, `MetricCatalogue`) because free text is how one measurement gets two spellings. **Validate against the catalogue.**
  - Write `assessment_id = NULL`, which is V5's "loose reading" meaning.
  - The trainer's bell has no backend table (the trainer's notifications gap), so the side effect has nowhere to land yet.
  - `prefs.hideWeight` is a **display** switch. It must not refuse the write.

### 7. `GET /v1/me/packages` · `GET /v1/me/payments`

**Packages** (`:838`)
- `created_at DESC`. Response: `{ id, name /* pack.name ?? 'Session pack' */, type, sessionsTotal, sessionsRemaining, amount, amountPaid, amountDue, status, startDate, endDate }[]`.
- `amountPaid` / `amountDue` are the same derivation `PackageResponse` already does.
- The mock omits `pausedAt`. Consider adding it, since a paused pack reading as live is a small lie to the client.

**Payments** (`:859`)
- `created_at DESC`. Response: `{ id, amount, method, status, paidAt, createdAt }[]`.
- **Must withhold `collected_by`, `gym_share_amount` and `share_percent`**. The mock's comment says those are the trainer's arrangement with the gym.
- `receipt_no`, `note` and `upi_reference` are not on the read either. The export does include `upiReference` and `note`.
- **RLS will not do the withholding:** `payment_client` exposes every column. The projection has to be explicit, field by field.
- `package_client` and `payment_client` exist. **No migration.**

### 8. `GET /v1/me/messages` · `GET /v1/me/milestones`

**Messages** (`:896`) merges two sources, sorted `at DESC`:
- `client_message` rows: `{ id, body, kind: 'note'|'program'|'report', at, readAt, trainerName }`.
- **Trainer notes with `sharedWithClient = true`**: `kind:'note'`, `at = updated_at`, `readAt` always null.
- **Backend gaps:**
  1. **There is no `client_message` table** (V6), and **no trainer route in the mock writes one**. They come only from the seed. So the trainer-side "send a line to the client" verb is undesigned.
  2. **`client_note` has no `shared_with_client` column.** V29's rule is that a note is `trainer_id`-private: a teammate gets an empty list, and there is **no `client_note_client` RLS policy**. Sharing needs a column plus a narrowly scoped read, or the portal drops that source.

```sql
client_message(id, client_id fk, trainer_id fk, body text not null, kind varchar check in ('note','program','report'),
               at timestamptz, read_at timestamptz, created_at, updated_at, deleted_at, tenant_id)
```
- RLS: staff read and write in their tenant; the client reads its own rows and may update only `read_at`, and only through the (currently uncalled) read route.

**Milestones** (`:956`)
- `at DESC`. Response: `{ id, kind, label, value: number|null, at }[]`.
- **Never windowed.**
- Stored rather than derived, because a milestone fired on a particular day.
- The only live minter is `/finish` (every 25th done session). The seed back-fills.

```sql
milestone(id, client_id fk, kind varchar, label text, value numeric null, at timestamptz, created_at, deleted_at, tenant_id)
```
- Add a unique index `(client_id, kind, value)` so a retried finish cannot fire it twice.

### 9. Bell and preferences: `GET /v1/me/notifications` · `POST …/{id}/read` · `POST …/read` · `PATCH /v1/me/prefs`

> ✅ **Done 23 Sep 2026 — `V18__client_prefs_and_notifications.sql`.** `client_prefs` with **no staff policy at all** (asserted: the client's own trainer reads zero rows), `client_notification` with no INSERT for anybody, and **`mint_client_notification()`** — the SECURITY DEFINER gate this section asks for, reading the one switch and writing into the client's workspace, or nothing. All four routes as specified. **Every minter in the table below is wired**, plus two the mock lacks and the backend needed: `DELETE /v1/sessions/{id}` on a future session (`cancelled`) and `PATCH /v1/payments/{id}/confirm` (the first confirmation, with the method). A booking run is **one** row naming the first session. `/finish` mints `best` with its milestone. The nominee is stored as specified (product owner's call, 23 Sep); what is told to the nominee, and the privacy wording, stay open. Tests: `PortalNotifyTest`, `TenantIsolationTest`.

**Feed** (`:938`)
- **Windowed to 21 days** (`CLIENT_FEED_WINDOW_DAYS`, `:72`) on the server, `at DESC`.
- Response: `{ id, kind: 'note'|'plan'|'session'|'pack'|'best', amount, subjectAt, text, at, readAt }[]`.
- `clientId` is deliberately **not** projected.
- No `?unread` filter, by design.
- The web drops any row whose `kind` it does not know (api.ts:575).
- **Rows are facts, never rendered sentences.**

**Mark read**
- `/{id}/read` → `{ id, readAt }`. Idempotent and never unreads. Not the client's → `404`.
- `/read` marks all of the client's unread rows in **one** request → `{ readAt }`.

**The mint** is `mintClientNotification` (`portal.ts:155`), gated **at the moment of sending**, not on the read. The gates are `note→trainerNote`, `plan→programUpdated`, `session→sessionReminder`, `pack→packChanged`, `best→personalBest`.
- No prefs row means every switch passes.
- A refused mint never fails the write that caused it.
- **The minters are trainer routes** in `mock/router.ts`, so this is backend work on existing endpoints, not only new ones:

| Trainer route that mints | Kind |
|---|---|
| diary reconcile (`announceBooking`, `:555`) | session |
| `POST /sessions` | session |
| `PATCH/PUT /sessions/{id}` | session |
| `DELETE /sessions/{id}` | session |
| `POST /clients/{id}/packages` | pack |
| `POST /payments` | pack |
| `POST /packages/{id}/payments` | pack |
| `POST /packages/{id}/renew` | pack |
| `POST /templates/{id}/apply` | plan |
| `PATCH /programs/{id}` | plan |
| `POST /programs/{id}/notify` | plan |

- The portal's own `/finish` mints `best`.
- Nothing mints `note` outside the seed.
- `POST /programs/{id}/notify` **does not exist on the backend**.

```sql
client_notification(id, client_id fk, kind varchar check in ('note','plan','session','pack','best'),
                    amount numeric null, subject_at timestamptz null, text text null,
                    at timestamptz not null, read_at timestamptz null, created_at, tenant_id)
-- index (client_id, at desc)
```
- RLS: client reads its own rows and updates only `read_at`. Staff insert through the trainer routes above. Staff do **not** need to read it.

**Prefs** (`PATCH /v1/me/prefs`, `:1400`)
- Body: `{ hideWeight?: boolean; notify?: Partial<notify>; nominee?: {name, phone} | null }`. Response: the full `PrefsWire`.
- The row is **created on first write** with the all-on defaults.
- `notify` is **merged**, not replaced.
- `nominee`: key present with `null` clears it. An object needs a trimmed `name` (else `400 VALIDATION nominee.name: required`), clipped to 80 characters, and a 10-digit `phone` (else `400 VALIDATION`). An absent key leaves it alone.

```sql
client_prefs(client_id uuid pk fk, hide_weight boolean not null default false,
             notify_program_updated / notify_session_reminder / notify_trainer_note /
             notify_personal_best / notify_pack_changed boolean not null default true,
             nominee_name varchar(80) null, nominee_phone varchar(15) null,
             created_at, updated_at, tenant_id)
```
- **Client-only RLS, with no staff policy.** This is "the only table the trainer's half never reads", and the visibility card's promise depends on it.
- The notification mint in trainer routes then needs a `SECURITY DEFINER` gate function (e.g. `client_notify_allowed(client_id, kind)`) rather than a staff read of the table.

### 10. `POST /v1/me/phone/{challenge,verify,request,confirm}`

> ✅ **Done 23 Sep 2026 — `V19__portal_account.sql` (+ the V20 guard fix).** The trainer's ladder with the real ten-minute signed ticket and the real OTP service (lock, ceiling, waits). The "already taken" check is the SECURITY DEFINER `portal_phone_in_use()` this section asks for (it sees every roster in every workspace, answers yes/no only), and the swap is `portal_change_client_phone()` — every client row on the old number, declined ones included, **and `app_user.phone`**, in one transaction, refusing to move any number but the session's own. `confirm` returns a fresh client credential through the token issuer (a session on the web). Test: `PortalAccountTest` (real codes via a capturing sender).

The four steps (`portal.ts:1475`), the same ladder as `/v1/trainers/me/phone/*` (`backend/.../trainer/AccountController.java`):
1. `challenge`: no body, **204**. Sends an OTP to the current number.
2. `verify`: `{ otp }` → `{ ticket }`. A wrong code → `422 OTP_WRONG`.
3. `request`: `{ ticket, phone }` → **204**. It checks before spending an SMS:
   - not 10 digits → `400 VALIDATION`;
   - the number is the trainer's → `409 PHONE_TAKEN`;
   - the number is already on any roster → `409 PHONE_TAKEN`.
4. `confirm`: `{ ticket, phone, otp }` → `{ phone, token }`.
   - It rewrites the phone on **every client row for the old number** (every roster, across workspaces) and mints a new client token. **The caller must store the token**, because the old token's phone no longer resolves (`NOT_A_CLIENT`).

**Tighten on the backend.** The mock never validates the ticket (it is `mock-ticket-…`), and it uses the demo OTP. The real ticket is the 10-minute signed JWT, which the web keeps in an httpOnly cookie. Reuse `OtpService` and its lock/ladder (3 attempts, 10-minute lock).

**Also update `app_user.phone`.** It is `UNIQUE` (`app_user_phone_key`) and is the identity row, while `client.phone` has only a non-unique index. "Already on a roster" should be checked across tenants as a `SECURITY DEFINER` lookup, since the client's RLS cannot see other rosters.

**No migration.**

### 11. Check-ins (new since the port): `GET /v1/me/assessments` · `GET /v1/me/assessments/{id}` · `POST …/{id}/answers` · `POST …/{id}/submit`

> ✅ **All four done** — the reads in 11a, **answers and submit in 11c (23 Sep 2026)**, exactly as specified here (validate-before-remove, kind checks, `clear`, template order, `409 CLOSED`, `400 EMPTY`, partial submission, no bell). They are *assessments* throughout — the V14 `assessment` table, which already carries the tier-4 client policy the writes use. Tests: `PortalClientWriteTest`, `TenantIsolationTest`.

**Model** (`mock/types.ts:979–1186`, `mock/assessment-catalog.ts`)
- A **questionnaire** the trainer sends.
- `AssessmentTemplateRow` holds `{ name, description, measurements:{on, keys[]}, questions:{on, items: AssessmentQuestionRow[]} }`.
- An `AssessmentRow` instance holds `{ clientId, templateId|null, name, dueAt, sentAt|null, completedAt|null, readAt|null, measurements:{got,asked}, questions:{got,asked}, readings:{key,value}[], answers:{questionId, yes, rating, text, optionIds[]}[] }`.
- The catalogue has **21 measurement keys** in four groups. The groups include **Vitals: `resting_hr`, `bp`**, and the keys use **different ids from V5's six** (`body_weight`/`hips`/`arm_right` with a `metric` bridge field to `weight`/`hip`/`arm`).
- There are **11 bank questions**, including **`q_pain` "Did anything hurt or feel off while training?"**.
- Answer kinds are `yesno | rating(scale) | text | choice(options, allowMultiple, allowCustom)`.

**Status** is `done` if `completedAt` is set, otherwise `late` if `dueAt < now`, otherwise `open`. A late check-in is still answerable.

**List** (`:982`)
- **Only rows with `sentAt` set.** An unsent row is the trainer's planning and must never be shown.
- An **open** row whose template was deleted (so nothing is asked) is dropped. A done row is always kept.
- Sorted `dueAt DESC, id ASC`.
- Response: `CheckInWire[] = { id, name, dueAt, sentAt, completedAt, status, measurements:{got,asked}, questions:{got,asked} }`.
- Timestamps here are **ISO strings**, unlike epoch ms everywhere else in `/v1/me`.

**Detail** (`:1001`)
- Returns `CheckInWire` plus `{ description /* template's */, asked: { measurements: MeasurementWire[] /* {key,label,group,unit,metric} */, questions: QuestionWire[] }, readings, answers }`.
- **What is asked is resolved from the live template.** There is no bank fallback, so a deleted template asks nothing.
- The `got`/`asked` counts on the row are frozen at send time.
- Not the client's, or unsent → `404 NOT_FOUND "No such check-in."`

**Answer** (`:1603`)
- Body: `{kind:'measurement', key, value?, clear?}` or `{kind:'question', questionId, yes?|rating?|text?|optionIds?, clear?}`. Response: the full detail.
- The check-in is already completed → `409 CLOSED`.
- A key or question the check-in does not ask → `400 VALIDATION`.
- Measurement: `value` must be finite and > 0.
- Question validation by kind:
  - `yesno` needs a boolean;
  - `rating` needs an integer in `1..scale` (default 10);
  - `text` must be non-empty after trimming;
  - `choice` needs at least one known option id, or an `Other` text **only when `allowCustom`**. A single-answer question keeps the first id.
- The server nulls the three fields that do not belong to the kind.
- `clear:true` removes the answer, which is how a skip withdraws an earlier answer.
- **The replacement is validated before the old value is removed**, so a 400 leaves the row untouched (a measured fix dated 23 Sep).
- Readings are re-sorted into the template's order, and `got` is recomputed.
- Unknown `kind` → `400 VALIDATION`.

**Submit** (`:1736`)
- Nothing answered → `400 EMPTY`.
- **Partial submission is allowed on purpose.**
- Sets `completedAt = now` and `readAt = null`, so the trainer sees it unread.
- **Does not** notify the trainer's bell, by design.

**Also in export and delete.** The export includes sent check-ins whole, and `DELETE /v1/me` drops them.

**Migration.** Nothing on the backend matches this.
- V5's `assessment` is a **body-measurement sitting** (`taken_at`, `note`, readings as `body_metric` rows with `assessment_id`). It is written by the trainer at `/v1/clients/{id}/assessments` and has **no client RLS policy**.
- The mock's trainer side uses the **same path word** (`/v1/assessments`, `/v1/assessment-templates`, `/v1/assessment-catalog`) for the questionnaire.
- Building this means new tables, for example `check_in_template`, `check_in`, `check_in_reading`, `check_in_answer`, each with `tenant_id`, plus a client policy on `check_in*`. They must **not** reuse the `assessment` name.
- It also needs the trainer-side template, catalogue and send routes, which are a separate gap.
- **Decide the health question first** (below).

### 12. `GET /v1/me/export`

> ✅ **Done 23 Sep 2026 (11e).** Field-listed as specified — the client row without `trainer_split_percent`, margin, assignment and `stale_*`; payments without `collected_by` / gym share; no private notes (shared ones appear as messages); sent assessments whole; `settings` the prefs row or null.

`portal.ts:1020` returns one JSON document:
```ts
{ exportedAt, client /* whole row incl. metadata */, trainer: trainerView, sessions, workouts, sets,
  measurements, packages,
  payments: { id, packageId, amount, method, status, upiReference, paidAt, note, createdAt }[],  // field-listed; no collectedBy/gymShareAmount
  messagesFromTrainer, feedback, milestones, checkIns /* sent only, with readings+answers */,
  settings /* client_prefs row or null */ }
```
- **Excludes the trainer's private `client_note` rows**, stated as deliberate.
- **Payments are projected field by field** so a new column cannot leak into the export. Keep that as an explicit projection in Java, not `SELECT *`.
- `client` is spread whole in the mock. The backend should **list its fields too**, and leave out `trainer_split_percent`, `assignment_margin_percent`, `assigned_by_app_user_id` and `stale_*`, which are the trainer's or team's arrangement for the same reason as `collected_by`.
- The web turns it into a download (actions.ts:419).

### Portal open questions

1. **`health` on `GET`/`PATCH /v1/me` is forbidden health data.** The interaction map files it as *legally excluded, not deferred*; NFR-8, the core data model and AGENTS' *No health data* rule all repeat it. The existing `client.metadata.health` gap entry stands. Consequences:
   - drop the field from `MeWire`, `PATCH` and the visibility card's row, **or**
   - build the sanctioned separate `health_note` table with its own consent.

   Until then, PATCH `/v1/me` has no field to carry (§1).
   - ✅ **Decided 23 Sep 2026:** include `health` now (the product owner's standing decision on health data), strip later if required. `PATCH /v1/me` carries `health` only.
2. **Check-ins bring in more health data**, on top of question 1. The catalogue's **Vitals** (`resting_hr`, `bp`) and the bank's **`q_pain`** are health inferences under the same rule. And 21 free-standing keys duplicate V5's six under other ids (`body_weight` vs `weight`, `hips` vs `hip`, `arm_right` vs `arm`), which repeats the `acsm_cpt` / `fat_loss` spelling problem this repo has already paid for twice. Decide:
   - drop Vitals and `q_pain` (or move them behind `health_note` consent);
   - make tape readings land as `body_metric` rows under V5's six ids, so they appear on the same charts;
   - rename the questionnaire so `assessment` keeps meaning V5's sitting.
   - ✅ **Decided 23 Sep 2026** — see the main *Open questions* §1–§2: named *assessment*, beside V5, V5's ids for shared measurements, and the whole catalogue ships for now with the health items kept isolable.

3. **`DELETE /v1/me` hard-deletes, and the backend's conventions assume soft delete.** A trainer's account is `deleted_at` with the number kept. Specific collisions:
   1. `package` rows are dropped while `payment.package_id` still points at them (FK violation). The mock also keeps payments with `client_id` blanked; `payment.client_id` is an FK, so the only way to do that is to null it.
   2. The trainer's **private `client_note`** rows are deleted, although the export deliberately treats them as the trainer's record.
   3. `package_adjustment`, `nudge_log`, `attention_dismissal`, `weekly_report`, `client_assignment` and `team_activity` all reference the client and are not handled.
   4. The mock does not check the typed confirmation.

   Needed: a written erasure policy that says what is erased versus anonymised versus retained for tax (payments, invoices), whether this is a DPDP §12 erasure or a membership exit, and whether it runs as a `SECURITY DEFINER` procedure rather than client-RLS deletes.
   - ✅ **Decided 23 Sep 2026: a membership exit** — see the main *Open questions* §6.

4. **A client write that moves money.** `/finish` marks the session done and decrements a pack. `ClientSyncService` states the opposite rule for the phone: a client cannot move, cancel or no-show a session. Which is right? If `/finish` does charge, it must reuse `markDone` (oldest first, skip `paused_at`, stamp `pack_package_id`/`pack_applied_at`), not the mock's first-active-pack decrement. There is also a double-charge race if the trainer marks the same session from the console at the same moment. Serialise on the session row.
   - ✅ **Decided 23 Sep 2026: `/finish` does not charge** — see the main *Open questions* §7.

5. **The nominee's phone and name, under DPDP §14.** This stores a **third person's** personal data, collected without their knowledge, in `client_prefs`. The mock includes it in the export. Decide:
   - retention after the client deletes (the mock drops it with the prefs row, which is probably right);
   - whether the nominee is ever notified;
   - whether it needs a separate lawful-basis note on the privacy screen.

   `lib/portal/grievance.ts` is still placeholder values.
6. **A client writing body metrics.** `POST /v1/me/metrics` is a client write into a table the trainer reads as coaching data. The mock accepts any `metricType`; the backend must restrict it to V5's six, and arguably to `weight` alone (the only one the web sends).
7. **Shared trainer notes in `/v1/me/messages`.** They need a `client_note.shared_with_client` column and a client read, against V29's rule that a note is private to its `trainer_id`. Alternatively, drop that source and rely on `client_message`, which no trainer route writes yet.
   - ✅ **The column exists (V7, 23 Sep 2026)**, so the union is buildable; the client read is part of module 11.

8. **The notifications fan-out is trainer-side work.** Eleven existing trainer endpoints must mint `client_notification` rows under a prefs gate the trainer's role cannot read (`client_prefs` has no staff policy). Needed: a `SECURITY DEFINER` gate, plus the `POST /v1/programs/{id}/notify` route, which does not exist.
9. **Tenant stamping on client writes.** `stamp_tenant_id()` takes `app.tenant_id`, which for a client is the first of possibly several workspaces. Every client insert (workout, set, feedback, metric, check-in answer) must set `tenant_id` from the resolved client row, or a two-roster client's rows land in the wrong book.
10. **Two unchecked assumptions about the backend.**
    - Existing gap: the dev seed cannot currently produce an attached client session (`AuthService.clientView` returns `unattached` under `inclineyou_app`). Fix that before any of this can be tested end to end.
    - `program.day_of_week` is weekday-keyed after V2, while the portal's `trainingDays` and `scheduled_session.template_day` are slots (§3). Check the Plan day routes against a real response.

---

## Backend routes and fields the mock does not model, and which must stay

The redesign never calls these, but the pre-port web relied on them, the phone relies on them, or `WEB_LAUNCH.md` requires them. Additive-only means **none may be removed or narrowed** because the new UI ignores them.

**V5 measuring cycle.** Built 13 Sep 2026 for the web, whose working tree has just dropped every caller (`lib/assessments/cycle.ts` and `metrics.ts` are gone).
> ⚠ **Partly removed 23 Sep 2026, by the product owner's decision:** the sitting (`assessment` table, `body_metric.assessment_id`, `GET`/`POST /v1/clients/{id}/assessments`) is gone — V5 rewritten before it shipped. **What stays is listed below without the struck line.** Note that nothing now advances `nextAssessmentOn` automatically.
- **Routes:**
  - ~~`GET` · `POST /v1/clients/{id}/assessments` (a sitting)~~ — removed
  - `PUT` · `DELETE /v1/clients/{id}/body-metrics/{metricId}` (correct = soft delete + new row)
  - `ClientResponse.assessmentIntervalDays` · `nextAssessmentOn` · `assessmentMetrics`
  - `TrainerResponse` and `UpdateRequest` `assessmentIntervalDays` · `assessmentMetrics`
- **What used them:** Today's `assessment-due` band, the client file's *Body* card with `?measure=1`, add-flow step 5, and Settings → *Measuring*. None of these exists in the mock (`grep assessment lib/today/deck.ts` finds nothing).
- **The decision (23 Sep 2026):** V14's questionnaire sits beside what is left of V5 (the cadence and body readings); V5's sitting is removed.

**V3 booking echo.** `ClientResponse.sessionsBooked` / `firstSessionAt` and `PackageResponse.sessionsBooked`.
- The redesign reads `sessionsBooked` from the sale (`package-actions.ts`), but no longer from `PUT /v1/clients/{id}`: step 3 of the new add flow returns `void`.

**V4 correction.** `POST /v1/packages/{id}/sessions` corrects a count without touching money (`AGENTS.md` *Correcting a count is not selling sessions*). The redesign has no caller.

**Session auth (V41).**
- **Routes:** `GET` · `DELETE /v1/auth/session`, `DELETE /v1/auth/session/all`.
- **Launch blocker:** `WEB_LAUNCH.md` requires the web to send `X-InclineYou-Client: web`, and neither tree does.
- **Mock does not model it:** the mock router answers a `POST /v1/auth/logout` that no screen calls (sign-out only clears cookies), and the backend has **no** such route. When the web adopts sessions, sign-out must become `DELETE /v1/auth/session`, not a new `logout` route.

**Workspaces (V37–V42).**
- **Routes:** `GET /v1/tenants`, `POST /v1/tenants/{id}/activate` (`token: null` is **not** a sign-out), `/members`, `/revenue`, `/stale-clients`, `/assign`, `/unavailable`.
- **The mock's stand-in:** the switcher derives workspaces from `/v1/team` (`lib/workspace/api.ts`), which `AGENTS.md` calls *only the switch is built*.

**Membership.**
- **Routes:** `POST /v1/auth/membership/{clientId}/{accept,decline,ack-removal}`.
- **Status:** needed by the still-`NotBuilt` `/invite/[clientId]` and the paused/removed walls, where consent is captured (`WEB_LAUNCH.md` §5.13).

**Team detail routes.**
- **Routes:** `/v1/team/transfer-ownership`, `/invites/phone-availability`, `/clients/{id}`, `/clients/{id}/assignments`, `/programs/{id}` and `/programs/{id}/exercises[/{exId}]`, `/exercises/{id}`.
- **Status:** built for the team pass; the redesign's `/team` screen is unchanged since the port and calls none of them.

**Program and workout long tail.**
- **Routes:** `POST /v1/programs`, `DELETE /v1/programs/{id}`, `POST`/`DELETE /v1/programs/{id}/exercises[/{exId}]`, `DELETE /v1/workouts/{id}/exercises/{rowId}`.
- **Status:** not called by the redesign.

**Other fields and routes.**
- `POST /v1/clients/{id}/body-metrics`: the redesign's only metric write is the client's own `POST /v1/me/metrics`.
- `GET` / `POST /v1/clients/{id}/report[/weekly]`, `POST /v1/exercises` `logType`, `/v1/devices/token`.
- The sync envelopes `/v1/sync/*` and `/v1/client/sync/*`. The phone depends on them, and web setup still uses `/v1/sync/pull` and `/push`.
- Fields: `ProgramResponse.schedule`, `AssignmentResponse.divergence` (read by the redesign's push panel through `lib/programs/diff.ts`), `SessionResponse.packDelta` / `packPackageId`, and `WorkoutSessionResponse.loggedBy`.

---

## Open questions

These are places where the mock, which is the spec for shape, does something that conflicts with a backend or product rule. **Decide before building.** None of them is specified above as the mock does it.

1. **Check-ins vs V5 — two meanings of "assessment".**
   - **The two models.** The redesign's assessment is a questionnaire (template, then instance, then client answers, with 21 measurement keys). V5's is a trainer-taken measurement sitting over **six fixed metric ids**, and `AGENTS.md` says *a seventh is a deploy*.
   - **Spelling clash.** The mock's keys spell overlapping measurements differently: `body_weight` vs `weight`, `hips` vs `hip`, `arm_right` vs `arm`. The `metric` field is a half-mapping, and this is the *one measurement, two spellings* failure the repo has already paid for (`acsm_cpt`, `fat_loss`).
   - **Chart provenance.** `history` deliberately charts check-ins apart from `body_metric`, so a client's waist can live in two series.
   - **To decide:** do check-ins replace V5, feed it (write readings to `body_metric` with an `assessment_id`-like link), or sit beside it? And do the catalogue keys adopt V5's ids for the six they share?
   - ✅ **Decided 23 Sep 2026.** The feature is called **assessment everywhere** — no *check-in* in routes, tables or copy. The catalogue **adopts V5's ids** for the tape measurements the two share (`weight`, `hip`, `arm`, …) rather than the mock's `body_weight` / `hips` / `arm_right`. **V5's sitting table was then removed** (before V5 shipped) so the questionnaire takes the plain names `assessment_template` / `assessment`; V5's cadence columns and body-reading corrections remain beside it. Built as V14.

2. **Health data in the check-in catalogue.** `mock/assessment-catalog.ts` ships:
   - a **Vitals** group: `resting_hr` (bpm) and `bp` (mmHg);
   - `visceral` fat;
   - the questions *"Did anything hurt or feel off while training?"* and *"What got in the way… Illness"*, plus recovery and sleep ratings.

   The monorepo rule is **no health data, anywhere**: *no injuries, no conditions, no medications*, legally excluded under the DPDP Act, not deferred. Blood pressure and a pain question are health data whatever the column is called. **Do not ship those catalogue entries** without the separate `health_note`-style consent path, and remove them from the catalogue served by `GET /v1/assessment-catalog`.

   ✅ **Decided 23 Sep 2026, by the product owner: ship the whole catalogue for now, health items included** (Vitals, visceral fat, `q_pain`, the *Illness* option), and strip the health-data collection later if required. This is a deliberate, recorded exception to the rule above rather than an oversight — build it so the health items are **isolable** (a catalogue group and question ids that can be withdrawn in one change) so that stripping them is cheap.

3. **`PATCH /v1/me { health }`.** This is unchanged from the old entry. The client writes free-text health and injury information into `client.metadata.health`. That is forbidden by four documents; the sanctioned path is a separate consented store, never the `client.metadata` every trainer read returns. Leave the route unbuilt, or build it without `health`.
   - ✅ **Decided 23 Sep 2026:** built, with `health` only and `phone` refused — the product owner's decision to include health data now and strip it later if required. **Note:** `client.metadata` is returned on the trainer's client reads, so the trainer can read what a client writes here; moving it to a consented store is part of the later strip.

4. **One live pack vs many.**
   - **The mock's behaviour.** `POST /v1/clients/{id}/packages` closes every other active package (`mock/router.ts:2095`). `renew` closes the old one and sets `endDate = now + 60d` (`:2485`). `done` decrements "the first active" pack.
   - **The backend's rule.** It keeps several live packs and spends **oldest first**, and `AGENTS.md` calls that the right shape: a sale may not be edited, so more sessions become a second row.
   - **The backend must not adopt the mock here.** The consequence is on the web: the redesign reintroduces `packages.find(p => p.status === 'active')` in `components/clients/file/Header.tsx:96`, `OverviewTab.tsx:208`, `lib/clients/client-api.ts:606`, `lib/portal/home.ts:460`, `lib/portal/account.ts:58` and `components/portal/AccountMe.tsx:88`. That is the exact bug `lib/clients/packs.ts` (`currentPack` / `packBalance`) fixed, and it has just been deleted from the web tree. **Port `packs.ts` back** rather than change the server.

5. **"Remove client" says permanent, and the endpoint archives.**
   - ✅ **Default taken 23 Sep 2026: option (b), the copy** — a web-side change; no erase endpoint was built.
   - **The mismatch.** `PersonalTab.tsx`'s *Remove* card reads *"permanent and cannot be undone"*. `DELETE /v1/clients/{id}` sets `archived` and `removed`, and keeps every row. The mock does the same.
   - **Option (a), erasure:** `POST /v1/clients/{id}/erase`. It strips identity (name, phone, notes, metrics, DOB), **keeps** payments with the identity removed (the books must survive), and takes a typed confirmation.
   - **Option (b), the copy:** change the sentence.
   - **Until one lands,** the sentence overstates what the button does.

6. **`DELETE /v1/me` as the mock does it.**
   - **What the mock deletes.** It hard-deletes packages while keeping payments that point at them, which breaks the FK. It deletes the trainer's **private** notes. It checks the typed-number confirmation only in the Next action.
   - **Server rules.**
     - Delete the membership, not the human.
     - Null `client_id` on payments, or keep a tombstone client row.
     - Never delete a note the trainer wrote about their own practice without deciding whose data it is.
     - Re-check `confirmPhone` server-side, as `DELETE /v1/trainers/me` already does.
   - ✅ **Decided 23 Sep 2026: a membership exit.** Soft-delete that roster's `client` row and the client's own data (prefs, notifications, assessment answers). **Keep** payments, packages and the trainer's private notes as the trainer's records. Check the typed number on the server. Other rosters on the same phone are untouched. It is not a DPDP erasure; that stays a separate, policy-first piece of work.

7. **Client-side money movement.**
   - **The mock's behaviour.** `POST /v1/me/workouts/{id}/finish` marks the booked session `done` and decrements a pack.
   - **Why it conflicts.** The phone's client sync forbids a client moving, cancelling or no-showing a session. A client finishing their own log **moves the trainer's money book**.
   - **To decide:** may a client's self-logged workout charge a session, or should it leave the booking for the trainer to mark (it would surface as `unmarked` on Today)? If yes, reuse `markDone`'s rules exactly: oldest-first, skip paused (`paused_at` gates the charge), and `packDelta` idempotent.
   - ✅ **Decided 23 Sep 2026: it does not charge.** `/finish` closes the workout and links it to the booking, and leaves the session `scheduled` for the trainer to mark — it surfaces as unmarked on Today. The rule that a client never moves the money book stands.

8. **Client writes and tenancy.**
   - **The problem.** `stamp_tenant_id()` reads `app.tenant_id`, which for a client token is the **first** of their workspaces (`AuthTokenFilter:117`). A client on two rosters would stamp portal writes (sets, metrics, feedback, check-in answers) into the wrong workspace.
   - **Fix:** every client insert must set `tenant_id` explicitly from the resolved `client` row.

9. **`client_note.shared_with_client` vs V29's *a note is private to its trainer*.** V29's rule protected notes from teammates, and sharing with the client is a new audience. The DDL default of `false` is the safety argument. Agree that a note can be retracted, has no `read_at`, and is timestamped by `updated_at` (mock `BACKEND_GAPS.md` §Notes) before building `/v1/me/messages` as a union.
   - ✅ **Built as agreed in V7 (23 Sep 2026):** `DEFAULT false` in the DDL, retractable with `PUT {sharedWithClient:false}`, no `read_at`, timestamped by `updated_at`, and a teammate still gets an empty list. The portal union lands with `/v1/me/messages` (module 11).

10. **Certified rows and RLS.** The handoff's *service-account owner in `template`* cannot be read across tenants under tier-1 RLS. See §Certified correction (b). Pick a separate tier-3 table, or relax `template.tenant_id`.
    - ✅ **Decided and built 23 Sep 2026:** a separate `certified_template` catalogue table (V11), SELECT-only for the request role. `template.tenant_id` is untouched.

11. **Assessment timestamps are ISO strings.** Every other route is epoch ms, and the check-in wire is not. Choose one before both halves harden around it.
    - ✅ **Decided 23 Sep 2026: keep ISO**, as the web reads it; recorded in `API.md` as the one exception.

12. **`apply` ending the prior plan across a team.** Ending the previous `active` program is right for the caller's own plan. It must never end a teammate's program on a reassigned client (*a team widens reads; it never moves ownership*), so the server has to scope it by `trainer_id`.

13. **Web-side fixes flagged by this pass, which are not backend gaps.**
    - `lib/log/api.ts:257` `?size=2000` is clamped to 100 server-side, so the console silently misses exercise names. Switch it to `?ids=`. **Still open.**
    - ~~The new add flow's `applyTemplate(…, { clientId })` needs either the server-side schedule derivation (§Programs) or the old `scheduleFor` pairing back in the web.~~ **Resolved server-side (23 Sep 2026):** `apply` with no `schedule` derives it from the client's standing week. Handle `400 SCHEDULE_MISMATCH` and print its `detail`.
    - ~~`ExerciseWire.secondaryTargets` and `formCues` are typed as required arrays. Treat them as optional until V6 lands.~~ **Resolved by V9:** the server always sends both, as `[]` when empty, so the required-array typing is now correct. (They are empty on every row until cues are authored.)
    - **New, from V7:** to clear a value on `PUT /v1/clients/{id}`, send `heightCm: 0` and `dateOfBirth: ""`. `null` still means *leave it alone*, so `putClientPhysical` sending `null` to clear silently keeps the old value.
    - **New, from V8:** after a write-off the pack's `amountDue` drops by the written-off amount (it lands on `package.written_off_amount`), so re-read the pack rather than recomputing the debt client-side. `markPaid` may now send `method` and `paidAt`; a future `paidAt` is a 400.
    - **New, from V8:** raising an invoice on a pending row is `409 NOT_PAID` — the *Raise an invoice* button should only be drawn on collected, trainer-collected rows.
