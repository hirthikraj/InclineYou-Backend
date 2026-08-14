-- Additive: an index for the send-rate throttle on /v1/auth/otp/request.
--
-- Every request now asks "how many codes has this number been sent since T" and
-- "when was the last one", twice per call. V1 indexed `phone` alone, which is
-- fine today and gets worse forever — otp_request is append-only and nothing
-- prunes it yet, so the row count per number only grows.
--
-- Nothing is renamed, retyped or dropped, per the schema-evolution contract.
CREATE INDEX IF NOT EXISTS idx_otp_request_phone_created_at
    ON otp_request (phone, created_at DESC);
