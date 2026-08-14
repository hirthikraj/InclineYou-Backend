-- Additive: move the wrong-attempt lock out of memory and into the row.
--
-- The lock lived in a ConcurrentHashMap on OtpService, which meant two things
-- nobody chose: a restart cleared every live lock, and a second instance never
-- saw the first one's. Three wrong codes bought a ten-minute wait that a deploy
-- ended early — so the brute-force ceiling was really "3 attempts per restart".
--
-- `wrong_attempts` (V7) already lives here, so the lock its count imposes belongs
-- beside it. The END of the wait is stored rather than its start: the duration was
-- decided when the lock was imposed, and later re-tuning app.otp.lock-minutes must
-- not retroactively lengthen or cut short a wait somebody is already serving.
ALTER TABLE otp_request
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Read on every verify and every send: "is this number serving a wait". Partial,
-- because only a handful of rows ever carry one.
CREATE INDEX IF NOT EXISTS idx_otp_request_phone_locked_until
    ON otp_request (phone, locked_until DESC)
    WHERE locked_until IS NOT NULL;
