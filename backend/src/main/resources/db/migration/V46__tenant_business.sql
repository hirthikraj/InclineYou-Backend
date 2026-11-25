-- V46 — a workspace's business (22 Nov 2026, the owner's call).
--
-- One business per workspace (tenant): a solo trainer's practice, or later a gym or a team. It is the face clients pay and,
-- once invoices turn on (R27), the "From" block on a bill. Decided with the owner:
--
--   · THE NAME IS THE WORKSPACE'S NAME. There is no second name column: `tenant.name` is the business name, shown in the
--     workspace switcher and on what clients see. A solo workspace still follows its trainer's name until its owner names it
--     something else (V1's follow_solo_tenant_name(), unchanged) — renaming it here is exactly that "something else".
--   · IDENTITY ONLY, PLUS WHERE TO PAY. Tagline, business phone, business email and an Indian postal address; and the UPI ID,
--     which MOVES here from the trainer (trainer_business.upi_vpa). No billing or tax section yet (no GSTIN, no PAN, no bank
--     account), and no logo — there is no image store.
--   · THE OWNER EDITS. Every member of the workspace may read it; only its live owner membership may change it
--     (app_owns_tenant). Today every workspace is solo and its trainer is its owner.
--
-- The UPI ID's move:
--   · every existing workspace gets its row, carrying its owning trainer's UPI ID (a solo workspace's owner is the trainer
--     whose home it is);
--   · client_pay_to() (V31) is replaced in place to read the client's WORKSPACE's business — at a gym, clients pay the gym;
--   · trainer_business.upi_vpa stays (additive-only) and is no longer read: PATCH /v1/trainers/me's `upiVpa` writes through to
--     the business of the trainer's home workspace, and its response reads from there, so the setup flow and any older build
--     keep working against one source of truth.
--
-- Backend + web only, like V30 and V32–V45: nothing enters sync.

CREATE TABLE tenant_business (
    tenant_id uuid NOT NULL,
    tagline varchar(120),
    phone varchar(16),
    email varchar(254),
    address_line1 varchar(120),
    address_line2 varchar(120),
    city varchar(80),
    state varchar(40),
    pincode varchar(6),
    upi_vpa varchar(100),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT tenant_business_pkey PRIMARY KEY (tenant_id),
    CONSTRAINT tenant_business_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES tenant (id) ON DELETE CASCADE,
    CONSTRAINT tenant_business_phone_format CHECK (phone IS NULL
        OR (phone ~ '^\+[1-9][0-9]{6,14}$' AND (phone !~ '^\+91' OR phone ~ '^\+91[6-9][0-9]{9}$'))),
    CONSTRAINT tenant_business_email_shape CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT tenant_business_pincode CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$'),
    CONSTRAINT tenant_business_upi_shape CHECK (upi_vpa IS NULL OR upi_vpa ~ '^[A-Za-z0-9._-]{2,99}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
    CONSTRAINT tenant_business_texts CHECK (
        (tagline IS NULL OR btrim(tagline) <> '') AND (address_line1 IS NULL OR btrim(address_line1) <> '')
        AND (address_line2 IS NULL OR btrim(address_line2) <> '') AND (city IS NULL OR btrim(city) <> '')
        AND (state IS NULL OR btrim(state) <> ''))
);

COMMENT ON TABLE tenant_business IS
    'A workspace''s business (V46): tagline, contact, Indian postal address and the UPI ID clients pay. Its name is tenant.name.';
COMMENT ON COLUMN trainer_business.upi_vpa IS
    'Superseded by tenant_business.upi_vpa (V46): copied there, no longer read. Kept because columns are never dropped.';

CREATE TRIGGER trg_tenant_business_updated_at BEFORE UPDATE ON tenant_business FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every workspace has its row from birth, so readers never have to tell "no business" from "not set up".
CREATE FUNCTION ensure_tenant_business() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
BEGIN
    INSERT INTO tenant_business (tenant_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE TRIGGER trg_tenant_business_row AFTER INSERT ON tenant FOR EACH ROW EXECUTE FUNCTION ensure_tenant_business();

-- Backfill: one row per workspace, the UPI ID from the trainer who owns it. A solo workspace is its trainer's home; any other
-- is owned through its live owner membership.
INSERT INTO tenant_business (tenant_id, upi_vpa)
SELECT tn.id,
       (SELECT nullif(btrim(tb.upi_vpa), '')
          FROM trainer t JOIN trainer_business tb ON tb.trainer_id = t.id
         WHERE t.home_tenant_id = tn.id
            OR t.app_user_id = (SELECT tm.app_user_id FROM tenant_member tm
                                 WHERE tm.tenant_id = tn.id AND tm.role = 'owner' AND tm.status = 'active'
                                   AND tm.deleted_at IS NULL LIMIT 1)
         ORDER BY (t.home_tenant_id = tn.id) DESC
         LIMIT 1)
  FROM tenant tn
ON CONFLICT (tenant_id) DO NOTHING;
-- A stored UPI ID that the new shape check refuses would have failed the insert above; none can, because the web and the
-- setup flow only ever accepted this shape — but a row that did would be NULL here rather than stop the migration.
UPDATE tenant_business SET upi_vpa = NULL WHERE upi_vpa IS NOT NULL AND upi_vpa !~ '^[A-Za-z0-9._-]{2,99}@[A-Za-z][A-Za-z0-9.-]{1,63}$';

-- ─── who may touch it ────────────────────────────────────────────────────────

ALTER TABLE tenant_business ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    EXECUTE 'CREATE POLICY tenant_business_read ON tenant_business FOR SELECT TO inclineyou_app
        USING (app_actor() = ''staff'' AND tenant_id = ANY (app_tenant_ids()))';
    EXECUTE 'CREATE POLICY tenant_business_owner_update ON tenant_business FOR UPDATE TO inclineyou_app
        USING (app_actor() = ''staff'' AND app_owns_tenant(tenant_id))
        WITH CHECK (app_actor() = ''staff'' AND app_owns_tenant(tenant_id))';
    EXECUTE 'REVOKE ALL ON tenant_business FROM inclineyou_app';
    EXECUTE 'GRANT SELECT, UPDATE ON tenant_business TO inclineyou_app';
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — policies and grants skipped';
END $$;

-- ─── the client pays the workspace ───────────────────────────────────────────
-- V31's door, replaced in place (signature and grants unchanged): the UPI ID of the business of the client's own workspace.

CREATE OR REPLACE FUNCTION client_pay_to(p_client uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
    SELECT nullif(btrim(b.upi_vpa), '')
      FROM client c
      JOIN tenant_business b ON b.tenant_id = c.tenant_id
     WHERE c.id = p_client
       AND c.deleted_at IS NULL
       AND app_actor() = 'client'
       AND p_client = ANY (app_client_ids())
       AND client_can_see_money(p_client)
$$;
