-- V41 — server-side sessions, for the web.
--
-- The web app and the phone want opposite things from a credential.
--
-- The phone is offline half the time and cannot ask a server whether it is still
-- signed in. A self-contained JWT is exactly right for it: it works with no
-- signal, it needs no round trip, and its cost — you cannot revoke it before it
-- expires — is acceptable on a device the trainer is holding.
--
-- The browser is never offline in any interesting sense, and it has the opposite
-- risk profile: a token that leaks from a browser is a token somebody else's
-- machine is now holding, and "wait seven days" is not an incident response. So
-- the web gets an OPAQUE token that means nothing on its own and is looked up on
-- every request — which buys revocation, a device list, and the ability to end a
-- session the moment a password-equivalent event happens.
--
-- One auth surface, two issuers behind an interface (`AuthTokenIssuer`). The
-- filter resolves either and produces the same `Authentication`, so no controller
-- and no service learns which kind it was.
--
-- ── What is stored ──────────────────────────────────────────────────────────
--
-- The HASH, never the token. Same discipline as `otp_request.otp_hash`: a
-- database dump must not be a set of live credentials. SHA-256 rather than
-- bcrypt, deliberately — this is a 256-bit random value with no structure to
-- guess, so it needs a fast one-way function, not a slow one tuned for
-- low-entropy human input. Bcrypt here would cost a KDF on every single request.

CREATE TABLE IF NOT EXISTS web_session (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Hex SHA-256 of the opaque token. UNIQUE, and the only way in.
    token_hash   VARCHAR(64)  NOT NULL UNIQUE,

    -- Who this session is. `subject` is what the equivalent JWT would carry —
    -- a trainer UUID for a trainer, the phone for every other role — so that
    -- `SecurityContextHolder.getAuthentication().getName()` reads identically
    -- whichever issuer minted the credential, and the 46 call sites that read it
    -- do not change.
    subject      VARCHAR(64)  NOT NULL,
    phone        VARCHAR(15)  NOT NULL,
    role         VARCHAR(20)  NOT NULL,

    app_user_id  UUID         REFERENCES app_user(id),

    -- The workspace this session is standing in. Nullable, because a `pending`
    -- or `invited` session has proved a number and belongs to no workspace yet.
    -- Switching workspace UPDATES this row rather than minting a new credential,
    -- which is the second thing a server-side session buys.
    tenant_id    UUID         REFERENCES tenant(id),

    issued_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Advanced on use, and only when it has moved by more than a minute — a
    -- write on every request would make this table the hottest one in the
    -- schema for no gain in accuracy.
    last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    expires_at   TIMESTAMPTZ  NOT NULL,

    -- Set on sign-out and on any event that should end every session. A column
    -- rather than a DELETE, because "this session was revoked at 14:02" is worth
    -- being able to answer, and because the row is the audit trail.
    revoked_at   TIMESTAMPTZ,

    -- For the "signed in on" list. Truncated in code; no IP is kept beyond what
    -- the trainer needs to recognise their own laptop.
    user_agent   VARCHAR(300),
    created_ip   VARCHAR(64),

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_web_session_updated_at ON web_session;
CREATE TRIGGER trg_web_session_updated_at
    BEFORE UPDATE ON web_session
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The lookup on every request is by hash; the index is the UNIQUE above.
-- This one is "show me my sessions" and "end them all".
CREATE INDEX IF NOT EXISTS idx_web_session_subject
    ON web_session (subject, revoked_at);

-- Sweeping expired rows. Unlike `otp_request` — whose V1 comment promised a
-- cleanup job that was never written and whose table has been growing since the
-- first sign-in — this one is swept by `SessionSweeper`, and the index is why it
-- can be.
CREATE INDEX IF NOT EXISTS idx_web_session_expiry
    ON web_session (expires_at) WHERE revoked_at IS NULL;

-- `web_session` carries no `tenant_id` policy of its own and is deliberately not
-- in the RLS set (V42). It is authentication state, consulted BEFORE a tenant
-- context exists — a policy on it would have to be satisfied by the very context
-- it is being read to establish.
