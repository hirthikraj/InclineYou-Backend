-- V12 · A COPY IS NOT A REVISION
--
-- V11 put the ordinary `set_updated_at` trigger on `certified_template`, and
-- `updated_at` is not ordinary there: it is the REVISION clock. A trainer's
-- copy is stale exactly when its frozen `copied_from_updated_at` is older than
-- the original's `updated_at`. But the copy route bumps `used_count` in the
-- same breath, the trigger stamped `updated_at = now()` on that bump, and so
-- every copy reported "the original was revised since you copied it" the
-- instant it was made — and every earlier copy of the same program went stale
-- whenever anybody else copied it. Found by `CertifiedProgramsTest`.
--
-- Fixed forward rather than by editing V11, per the standing law (V11 has run).
-- The trigger now fires only when something OTHER than the use count changes,
-- so a content revision still moves the clock and a copy never does.

DROP TRIGGER trg_certified_template_updated_at ON public.certified_template;

CREATE TRIGGER trg_certified_template_updated_at BEFORE UPDATE ON public.certified_template
    FOR EACH ROW
    WHEN ((to_jsonb(OLD) - 'used_count' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'used_count' - 'updated_at'))
    EXECUTE FUNCTION public.set_updated_at();
