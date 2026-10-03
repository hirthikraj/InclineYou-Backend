-- The gym directory (3 Oct 2026): which physical gyms our trainers work at, as a platform-level fact.
--
-- It is `gym_place`, NOT `gym`. `gym` is reserved for the Ring 2 gym ORGANISATION account
-- (CLAUDE.md, gym platform PRD): something that signs up, owns commercial terms and sees its
-- clients' money. A gym_place is only a pin on a map that trainers pointed at. It must never be
-- used to authorise anything, find "a gym's clients" or move money — the same bug the PRD names
-- for matching on trainer.gym_name.
--
-- No tenant_id, and deliberately not policied by a tenant tier: one gym is shared by trainers
-- in many workspaces, which is the whole point (counting them). Access is narrowed instead:
--   * the request role can READ only the place its own trainer_business row points at;
--   * it cannot enumerate, insert, update or delete the directory — upsert_gym_place() below is
--     the one door in, and it can only ever add a place or fill blanks, never overwrite;
--   * gym_place_stats is owner-only (support / sales), counts only, no person is named.

CREATE TABLE gym_place (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    place_id text NOT NULL,                 -- Google Places id: the identity
    name varchar(120) NOT NULL,
    address text,
    city varchar(80),
    lat numeric(9,6),
    lng numeric(9,6),
    map_link text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT gym_place_pkey PRIMARY KEY (id),
    CONSTRAINT gym_place_place_id UNIQUE (place_id),
    CONSTRAINT gym_place_text CHECK (btrim(place_id) <> '' AND btrim(name) <> ''),
    CONSTRAINT gym_place_coords CHECK ((lat IS NULL) = (lng IS NULL)
        AND (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180))),
    CONSTRAINT gym_place_link_scheme CHECK (map_link IS NULL OR map_link ~* '^https?://')
);

CREATE TRIGGER trg_gym_place_updated_at BEFORE UPDATE ON gym_place FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Who points at it. Nullable: free-text gym_name keeps working and simply carries no place.
ALTER TABLE trainer_business ADD COLUMN gym_place_id uuid REFERENCES gym_place (id);
ALTER TABLE gym_arrangement ADD COLUMN gym_place_id uuid REFERENCES gym_place (id);
ALTER TABLE trainer_payout ADD COLUMN gym_place_id uuid REFERENCES gym_place (id);

CREATE INDEX idx_trainer_business_gym_place ON trainer_business (gym_place_id) WHERE gym_place_id IS NOT NULL;
CREATE INDEX idx_gym_arrangement_gym_place ON gym_arrangement (gym_place_id) WHERE gym_place_id IS NOT NULL;
CREATE INDEX idx_trainer_payout_gym_place ON trainer_payout (trainer_id, gym_place_id, received_at DESC)
    WHERE gym_place_id IS NOT NULL AND deleted_at IS NULL;

-- The only door in. DEFINER so the request role needs no write grant on the directory; it can
-- add a place and fill blanks on one that exists, never rewrite what another trainer's pick put
-- there. Returns the row id either way, so a repeat is idempotent. A caller with no trainer
-- label (an unauthenticated or non-trainer connection) is refused.
CREATE FUNCTION upsert_gym_place(p_place_id text, p_name text, p_address text, p_city text,
                                 p_lat numeric, p_lng numeric, p_map_link text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_catalog AS $$
DECLARE gid uuid;
BEGIN
    IF app_trainer_id() IS NULL THEN
        RAISE EXCEPTION 'upsert_gym_place: a signed-in trainer is required' USING ERRCODE = 'insufficient_privilege';
    END IF;
    INSERT INTO gym_place (place_id, name, address, city, lat, lng, map_link)
    VALUES (btrim(p_place_id), btrim(p_name), nullif(btrim(p_address), ''), nullif(btrim(p_city), ''),
            p_lat, p_lng, nullif(btrim(p_map_link), ''))
    ON CONFLICT (place_id) DO UPDATE SET
        address  = coalesce(gym_place.address,  EXCLUDED.address),
        city     = coalesce(gym_place.city,     EXCLUDED.city),
        map_link = coalesce(gym_place.map_link, EXCLUDED.map_link),
        lat      = CASE WHEN gym_place.lat IS NULL THEN EXCLUDED.lat ELSE gym_place.lat END,
        lng      = CASE WHEN gym_place.lat IS NULL THEN EXCLUDED.lng ELSE gym_place.lng END
    RETURNING id INTO gid;
    RETURN gid;
END $$;

-- Sales / support read this as the owner (scripts/gym-stats.sh). Counts, never people.
CREATE VIEW gym_place_stats AS
SELECT g.id AS gym_place_id, g.place_id, g.name, g.city,
       count(DISTINCT tb.trainer_id) AS trainers,
       count(DISTINCT c.id) FILTER (WHERE c.status NOT IN ('archived', 'prospect')) AS active_clients
FROM gym_place g
LEFT JOIN trainer_business tb ON tb.gym_place_id = g.id
LEFT JOIN trainer t ON t.id = tb.trainer_id AND t.deleted_at IS NULL
LEFT JOIN client c ON c.trainer_id = t.id AND c.deleted_at IS NULL AND c.erased_at IS NULL
GROUP BY g.id;

ALTER TABLE gym_place ENABLE ROW LEVEL SECURITY;
CREATE POLICY gym_place_mine ON gym_place FOR SELECT TO inclineyou_app
    USING (id IN (SELECT gym_place_id FROM trainer_business WHERE trainer_id = app_trainer_id()));

DO $$
BEGIN
    EXECUTE 'GRANT SELECT ON gym_place TO inclineyou_app';
    EXECUTE 'REVOKE ALL ON FUNCTION upsert_gym_place(text, text, text, text, numeric, numeric, text) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION upsert_gym_place(text, text, text, text, numeric, numeric, text) TO inclineyou_app';
    EXECUTE 'REVOKE ALL ON gym_place_stats FROM PUBLIC';
    -- the app role already holds table-wide grants on trainer_business / gym_arrangement / trainer_payout from V1
EXCEPTION WHEN undefined_object THEN
    RAISE WARNING 'role inclineyou_app is absent — grants skipped';
END $$;
