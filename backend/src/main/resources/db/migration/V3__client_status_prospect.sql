-- V3 · additive, approved 29 Sep 2026 (the add-client flow's prospect/active
-- split). A prospect is a real status now, not a derived tag: the roster's
-- own read needs to tell "asked to try a demo" apart from "training" without
-- guessing from the absence of a pack.

ALTER TABLE client DROP CONSTRAINT client_status;
ALTER TABLE client ADD CONSTRAINT client_status
    CHECK (status IN ('active', 'paused', 'inactive', 'archived', 'prospect'));
