-- Track wrong OTP attempts per code request so the backend can enforce the
-- max-attempts limit and issue a timed lock. Additive-only — no data loss.
ALTER TABLE otp_request
    ADD COLUMN wrong_attempts INT NOT NULL DEFAULT 0;
