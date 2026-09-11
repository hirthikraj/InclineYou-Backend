# Identity — who a person is, and how they prove it

**Status: PLANNED. Nothing below is built.** Companion to `TENANCY.md`, and the
same shape of argument one axis over: that file separated *who coaches* from
*whose books*, this one separates **who a person is** from **how they proved
it**. `SCHEMA.md` and `API.md` stay the reference; this carries the why and the
order.

Today `phone` does two jobs. It is a **credential** — prove you hold this SIM by
reading back a six-digit code — and it is an **identity key** — the string rows
are found by, including inside row-level security. Those two were one fact for
the same reason `trainer_id` and `tenant_id` were one fact until V37: nothing had
yet asked them to differ.

Three things now ask.

| Ask | What it does to the assumption |
| --- | --- |
| Social sign-in (Google, Apple) | A person proves themselves with something that is not a phone number |
| Device login tracking | A person is signed in from several places at once, each revocable |
| **Indian number recycling** | The same phone number is two different people, months apart |

The third is not a future problem. It is live the day two SIMs turn over, and
today it has no correct outcome — see §2.

**Email and password are explicitly out of scope, now and later.** That decision
is what keeps this document short: no hashing migration path, no reset tokens,
no enumeration surface, no deliverability. It is also most of why building this
ourselves stays the right call (§9).

---

## 1. What we must build

The four items below are **commitments, not options**. Each is something a
managed auth provider would have supplied and we have chosen to own. Owning them
is fine; leaving them unbuilt is not, and three of the four are already load-
bearing gaps rather than future work.

| # | Must implement | Why it cannot wait | Phase |
| --- | --- | --- | --- |
| **M1** | **JWT key rotation** — `kid` in the header, a two-key verification window, `JWT_SECRET` rollable without signing everyone out | One HMAC secret today, no `kid`, no rotation path. If it leaks, **every token in the field is forgeable** and the only response is changing the secret and ejecting every signed-in trainer | 0 |
| **M2** | **Refresh tokens** — rotating, one row per device | `expiry-minutes: 10080` is a hard 7-day expiry with no refresh anywhere in `auth/`. A trainer re-does OTP weekly, and OTP is the one flow that needs signal, on a product whose premise is a gym floor without any | 0 |
| **M3** | **OTP toll-fraud controls** — per-IP and per-prefix ceilings, velocity limits, a spend alarm | `max-sends-per-day: 10` bounds a *number*; nothing bounds an attacker rotating numbers. Harmless while `sms-enabled: false`; a live bill the day it flips | 1 |
| **M4** | **Google / Apple sign-in, and a real second factor** | Not needed today. Needed the moment we globalise — and M4 is also the **recycling defence** (§6), because a Google `sub` is not reassigned by a carrier | 3 |

M1 and M2 are phase 0 because they are gaps in shipped code. M3 is gated on the
SMS provider being wired. M4 is gated on the identity split that phases 1–2
deliver — attempting it first is what makes it expensive.

Two notes on scope. **M1 needs no migration** — it is `JwtService`, a config
shape, and a filter that tries two keys. **M4 needs no migration either**, once
§3 exists: a Google credential is a row with `kind = 'google'`, which is the
whole point of building §3 first.

---

## 2. Where we actually stand

### 2.1 Row-level security matches on the phone string

`app_phone()` is not sloppiness. V42 documents it as the answer to a real
chicken-and-egg problem: `app.tenant_ids` is what tier 1 filters on, but it is
computed by reading `tenant_member`, which is itself tier 1. A caller with no
workspace yet could never discover the workspaces they belong to. So
authentication sets one more thing — *the number it just proved* — because it is
**the only identity fact that exists before any workspace is known**.

That reasoning is correct. The choice of *which* fact is what this document
changes.

Three places depend on the string:

```sql
-- V42, tenant_member_self — bootstrap, FOR SELECT
USING (app_phone() <> '' AND app_user_id IN (
    SELECT au.id FROM app_user au
    WHERE au.phone = app_phone() AND au.deleted_at IS NULL));

-- V42, tenant_mine — bootstrap, FOR SELECT
USING (app_phone() <> '' AND id IN (
    SELECT tm.tenant_id FROM tenant_member tm
    JOIN app_user au ON au.id = tm.app_user_id
    WHERE au.phone = app_phone() ...));

-- V42, app_owns_tenant(uuid) — SECURITY DEFINER, widens team/team_member
AND au.phone = app_phone()
```

So a recycled number that passes OTP is handed the previous person's memberships
**by Postgres**, not by an application path we could patch in a service. The
wall itself is built on the string.

### 2.2 And the escape hatch is welded shut

V36 states it plainly, and defends it well:

> a deleted account's phone number is **not released**. `trainer.phone` and
> `app_user.phone` are both plain UNIQUE indexes, not partial on `deleted_at`.

That was right for its own reason — the trainer's clients, packages and payments
still point at that row, and releasing the number would orphan them. But combine
2.1 and 2.2 and there are exactly two outcomes when a number changes hands, both
wrong:

| Person A's account | Person B gets A's number | Outcome |
| --- | --- | --- |
| kept | B passes OTP | **B inherits A's data**, enforced by RLS |
| deleted | B tries to sign up | **B can never sign up**, permanently, no support path |

There is no third option today. This is the finding that orders everything
below.

### 2.3 V18 wrote the assumption down

```
-- The login. Unique across the whole product, which is what makes role
-- single-valued: one number, one person, one answer.
phone VARCHAR(15) NOT NULL UNIQUE,
```

"One number, one person, one answer" is the sentence being retired. V37 already
retired its sibling — one phone, one role — when `tenant_member` became the
many-to-many. This is the same correction applied to the left-hand side.

---

## 3. The model

A person is a row that never changes and is never reused. A credential is a way
of proving you are that person, and there may be several, and they may come and
go.

```sql
-- The human. Carries no contact details, no name, no role. Those live on
-- app_user, trainer and client, which is where they already are.
CREATE TABLE person (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE person_credential (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id   UUID NOT NULL REFERENCES person(id),

    -- 'phone' | 'google' | 'apple'. A plain string, like every other kind in
    -- this schema, so adding a provider is a code change and not a migration.
    kind        VARCHAR(20) NOT NULL,

    -- E.164 for a phone; the provider's `sub` for Google and Apple. NEVER an
    -- email address — see §7.2.
    identifier  VARCHAR(255) NOT NULL,

    verified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- The whole reason this table exists. Detaching releases the identifier for
    -- somebody else without deleting the person, without moving a single row,
    -- and without orphaning the payments that point at them.
    detached_at TIMESTAMPTZ,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live holder of any identifier; any number of historical ones.
CREATE UNIQUE INDEX uq_person_credential_live
    ON person_credential (kind, identifier) WHERE detached_at IS NULL;

CREATE INDEX idx_person_credential_person
    ON person_credential (person_id) WHERE detached_at IS NULL;
```

**That partial unique index is the entire fix.** It is what makes a number
releasable without being deletable, which is precisely the third option §2.2
says does not exist.

`app_user` gains `person_id UUID REFERENCES person(id)`. **`app_user.phone`
stays** — the additive law forbids dropping it, and it remains the right thing
to *display*. It stops being the key.

### 3.1 Why not put credentials on `app_user`

Because `app_user` is already the *account* — role, workspace memberships via
`tenant_member`, the subject of a token. A person who signs in with Google and a
phone is one human with one account and two credentials, and hanging a second
`phone2` column off `app_user` is how you get `phone3`. The row that must never
be reused is a different row from the one that carries changeable facts.

### 3.2 This keeps the door open in both directions

`person` + `person_credential` is, deliberately, the same model as Supabase's
`auth.users` + `identities`, and Clerk's users + identifiers. If we ever want a
provider to own Google and Apple, they become two more `kind` values verified
elsewhere, and our OTP flow, our two issuers (`AuthTokenIssuer`) and our error
catalogue are untouched. **The split is what makes the build-versus-buy decision
reversible** — which is a better reason to do it than any of the three asks.

---

## 4. The migrations

Next free number is **V43**. Note the collision to avoid: the gym PRD's sequence
is written as V28+ and `CLAUDE.md` says to read it eight numbers higher, which
lands it in this range too. Whoever writes first takes the numbers and the other
document gets renumbered — say so in the commit.

| | What | Reversible? |
| --- | --- | --- |
| **V43** | `person`, `person_credential`, the two indexes. `app_user.person_id`, nullable. Nothing reads them yet | yes, inert |
| **V44** | Backfill: one `person` per live `app_user`, one `phone` credential each, `person_id` set. Then `app_user.person_id` → `NOT NULL`. Owner work, runs as `xrep` | yes, data-only |
| **V45** | `device_session` (§5). Independent of V43–V44; can land first if M2 is urgent | yes |
| **V46** | **The cutover.** `app_person_id()` alongside `app_phone()`; the three policies of §2.1 rewritten to use it; a seventh session setting | **no** — see below |
| **V47** | Drop nothing. `app_phone()` and `app.phone` stay, unused, per the additive law | — |

**V44 is the one to be careful with.** It is a backfill over `app_user` on a live
database and it must be idempotent, because a re-run after a partial failure is
the likely case. Key it on `app_user.person_id IS NULL` and let it be re-entrant.

**V46 is the irreversible step**, in the same way V42 was: after it, a request
that sets `app.phone` but not `app.person_id` reads nothing. Both settings should
be sent for one release before the policies switch, exactly as V42's cutover was
staged behind `APP_DB_USERNAME`. Do not combine V46 with the application change
that starts sending the new setting — ship the sender first, verify it in the
`DatabaseIdentityCheck` log, then switch the policies.

### 4.1 The rewritten bootstrap

```sql
CREATE OR REPLACE FUNCTION app_person_id() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.person_id', true), '')::uuid $$;

DROP POLICY IF EXISTS tenant_member_self ON tenant_member;
CREATE POLICY tenant_member_self ON tenant_member FOR SELECT TO xrep_app
    USING (app_person_id() IS NOT NULL AND app_user_id IN (
        SELECT au.id FROM app_user au
        WHERE au.person_id = app_person_id() AND au.deleted_at IS NULL));
```

Same for `tenant_mine` and for `app_owns_tenant(uuid)` — and `app_owns_tenant`
stays **VOLATILE and SECURITY DEFINER** for the reason V42 gives at length. Do
not tidy that into STABLE while rewriting it; the team-creation path depends on
a fresh snapshot per call.

The bootstrap keeps its exact role: `app.person_id` is now *the only identity
fact that exists before any workspace is known*, and both policies stay
`FOR SELECT`, because discovering a membership must never be a way to write one.

---

## 5. M2 and device tracking are one table

The web already has this. `web_session` (V41) carries `last_seen_at`,
`revoked_at`, `user_agent` and `created_ip`, is swept by `SessionSweeper`, and is
explicitly outside the RLS set because it is authentication state consulted
*before* a tenant context exists.

Mobile needs the same row with a different lifecycle, so **V45 adds
`device_session`** rather than widening `web_session`:

```sql
CREATE TABLE device_session (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id       UUID NOT NULL REFERENCES person(id),
    app_user_id     UUID REFERENCES app_user(id),

    -- SHA-256 hex of the refresh token, never the token. As web_session.
    token_hash      VARCHAR(64) NOT NULL UNIQUE,

    -- Rotation: each refresh mints a new row and stamps this on the old one.
    -- A replayed token whose successor already exists is a stolen token —
    -- revoke the whole chain, do not merely refuse the call.
    rotated_to      UUID REFERENCES device_session(id),

    device_label    VARCHAR(120),
    platform        VARCHAR(20),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Two tables rather than one is a deliberate cost. `web_session` is an **access**
credential read on every single request; `device_session` is a **refresh**
credential read only at refresh time. Merging them would put the hottest lookup
in the schema in the same table as one of the coldest, and would give
`expires_at` two meanings. The seam is that the "signed in on" screen must read
both — name that in the endpoint, do not hide it.

Also outside RLS, for V41's reason verbatim: a policy on it would have to be
satisfied by the very context it is being read to establish.

**One table, three of the things we owe:** M2's refresh, revocation ("sign me out
of my other phone"), and the device list. This is why M2 is phase 0 — it is not a
stopgap, it is the foundation the other two sit on.

---

## 6. Number recycling: the policy

There is no reliable carrier lookup for this in India — no dependable "has this
subscriber changed" API of the kind that exists for SIM-swap in some other
markets. So this is signals and policy, not an integration.

The timing is in our favour. Roughly: a number goes dormant after about 90 days
of no usage, is deactivated, then sits in quarantine before reallocation.
**Verify the current TRAI durations before setting the constant** — but the
shape means we get a multi-month window, and **dormancy is the signal**.

1. **Track `last_used_at`** on the credential. Free once §5 exists.
2. **Set a dormancy threshold.** Six months is defensible given the quarantine
   period. Below it, OTP sign-in behaves exactly as it does today — no new
   friction for the overwhelming majority.
3. **Above it, OTP alone is not enough.** OTP proves the person holds the SIM
   *today*. It says nothing about whether they are the same human. Require a
   second signal: a linked Google credential (M4), or a device already on the
   list (§5).
4. **No second signal? Fork, never merge.** Show a masked hint — *"this number
   was last used by an account for R••••• S•••, in March"* — and make them
   affirm. If they say *not me*: detach the phone credential, create a fresh
   `person`, attach the number there. The old account keeps every row, now
   unreachable but intact for support.
5. **Reuse the vocabulary.** `client.stale_at` (V40) is already this idea applied
   to clients. One notion of dormant, not two.

The property that matters, and it is the same law as everywhere else in this
codebase: **at no point does a row change hands.** Detaching a credential is not
moving ownership. `person` is never reused, never merged, and never deleted while
anything points at it.

### 6.1 What this fixes, restated against §2.2

| Person A's account | Person B gets A's number | Outcome after this plan |
| --- | --- | --- |
| kept, active | B passes OTP | Under the threshold — this is a **genuine conflict**; refuse and route to support. Rare, and loud, which is correct |
| kept, dormant >6mo | B passes OTP, no second signal | Masked hint → *not me* → detach, new `person`. **B gets an account, A keeps their data** |
| deleted | B signs up | Credential was detached at deletion. **B signs up normally**; A's rows stay attached to A's `person` |

The third row is the one that is impossible today.

---

## 7. M4: social sign-in

### 7.1 It is small, and it is not password auth

Verifying a Google ID token: fetch the JWKS, check `iss`, `aud` and `exp`, take
`sub`. Apple is the same shape. This is genuinely a contained piece of work, and
it carries none of the risk profile that makes people say *don't build auth* —
there is no secret of the user's that we store, and nothing to reset.

It slots in as `AuthPrincipal` resolution beside OTP, and mints through the
existing `AuthTokenIssuer`. No new issuer, no new token kind.

### 7.2 Key on `sub`, never on `email`

Google says this explicitly, and the reason will be familiar: **Workspace email
addresses get reassigned to new employees.** It is the recycling bug wearing
different clothes, and `person_credential.identifier` holding a `sub` is what
keeps us out of it. The same rule applies to Apple, whose relay addresses can
also be recycled.

Store the email, if we want it, on `app_user` as a contact detail — which is
exactly the status V36 already gave `trainer.email`: *stored, shown back, and
branched on by nothing*.

### 7.3 Two things to check before building

- **App Store guideline 4.8.** Offering Google sign-in in the Expo app carries
  requirements about an equivalent privacy-preserving option. This is a review
  problem, not a code problem, and it is far cheaper to know before the build.
- **`app_user.phone` is `NOT NULL`.** A Google-only sign-up has no phone. Either
  keep phone mandatory at account level (defensible — the roster, nudges and
  `wa.me` deep links all assume one) or make it nullable in the same migration.
  Decide it deliberately; do not discover it at the first Google sign-up.

### 7.4 Globalisation, while we are here

Phone-as-identity gets **worse** outside India, not better: E.164 normalisation,
VOIP and disposable numbers, markets where SMS OTP is unreliable or costly, and a
DLT-equivalent registration to repeat per country. The credential split is what
lets Google carry the identity in a market where SMS is a bad primary. Also check
`VARCHAR(15)` on the phone columns against the countries actually targeted — it
is E.164-tight.

---

## 8. Application changes

| Area | Change |
| --- | --- |
| `TenantAwareDataSource` | A seventh setting, `app.person_id`. Still one round trip, still `set_config(..., false)` on borrow — see `TENANCY.md` §5.2 for why not `SET LOCAL` |
| `AuthPrincipal` | Gains `personId`. It is the fact everything below should resolve from |
| `AuthTokenFilter` | Populates it from either issuer |
| `JwtService` | **M1**: `kid` on mint, two-key window on verify |
| `web_session` | Gains `person_id`. `subject` is unchanged — 46 call sites read it and none of them need to change |
| `AuthService` | Credential lookup replaces the phone lookup; the dormancy check of §6 |
| `ClientPhoneGuard` | Re-reads against credentials rather than `app_user.phone` |
| `SessionSweeper` | Sweeps `device_session` too |
| `OtpSendLimiter` | **M3**, once a provider is wired |

**The JWT subject does not change.** It stays a trainer UUID for trainers and a
phone for everyone else. Changing it would touch `SecurityConfig`,
`RateLimitFilter` (which keys buckets off it) and the controllers that read it
from `SecurityContextHolder` — and it buys nothing, because `person_id` rides as
its own claim exactly as `tid` does. This is the same decision V41 made and for
the same reason.

**Nothing enters sync.** Same shape as V30 and V32–V36: no mobile change is
required to land any of this, beyond M2's refresh call.

### 8.1 Testing

`TenantIsolationTest` is where the walls are asserted, because it opens its own
`xrep_app` connections while the rest of the suite is pinned to the owner. Two
cases must land there or V46 is untested:

- a request setting `app.person_id` reads exactly its own memberships;
- **a recycled identifier reads nothing** — detach a phone credential, attach it
  to a second `person`, and assert the second reads none of the first's rows.

The second is the whole point of the document. It should fail loudly against
today's schema before V46 makes it pass.

---

## 9. What this does not do, and what it costs

**It does not make us an auth company.** The surface stays: phone + OTP, and
later two OIDC providers. No passwords, no reset flows, no enumeration surface,
no MFA-by-SMS-to-the-same-number theatre.

**It does not remove Spring Security**, and neither would a provider — that is
worth remembering the next time the build-versus-buy question comes round. A
managed provider would still leave us a filter chain, path rules, and a JWT to
validate on every request. What it would have given us for free is exactly the
four items in §1, which is the honest price of having built our own.

**It does not fix `otp_request` growth.** V41's comment notes that table has been
growing since the first sign-in with no sweeper. Unrelated, still true, still
worth a line in whichever migration is nearest.

**Open, and deliberately not decided here:**

- the dormancy threshold, pending the current TRAI durations;
- whether `app_user.phone` becomes nullable (§7.3);
- whether the gym PRD or this document takes V43;
- whether a second factor for gym-admin accounts is TOTP or a passkey — a
  question for Ring 2, not for this plan.
