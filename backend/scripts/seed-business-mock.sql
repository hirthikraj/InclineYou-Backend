-- Mock MONEY history for one trainer — packs, sales, payments, gym split, pay terms and payouts —
-- so the Business pages (Overview · Transactions · Packages · Gym share · Reports) have six months to draw.
--
-- It LAYERS on a trainer who already exists and already has clients; it never touches a client
-- the trainer made. Every row it writes has a deterministic id in the 9d0c0000-0000-4000-8000-… range,
-- which is how `reset=1` finds exactly its own rows (soft-deleting them, as the product does) and how
-- a second run is a no-op rather than a duplicate.
--
-- What it builds, relative to today so the picture stays current:
--   · a price list: four of the trainer's own packs and two gym packs (one % share, one flat share)
--   · sales May → this month on the trainer's existing clients: paid in full (UPI · cash · bank),
--     part-paid with an overdue balance, part-paid with an expected one, a written-off remainder, a refund
--   · two gym clients with gym-desk payments (collected_by 'gym'; the database stamps it)
--   · the trainer's gym, one running pay arrangement (₹12,000 minimum) and three payouts, so the
--     settlement card has a balance due
--
-- Run through seed-business-mock.sh. Needs the OWNER role: a seed writes across tenants' RLS.

SELECT set_config('mock.phone', :'trainer_phone', false), set_config('mock.reset', :'reset', false) \gset

BEGIN;

DO $mock$
DECLARE
  v_phone  text := current_setting('mock.phone');
  v_reset  boolean := current_setting('mock.reset') = '1';
  v_user   uuid;  v_tid uuid;  v_ten uuid;  v_cur text;
  v_ids    uuid[];
  -- deterministic ids: 9d0c0000-0000-4000-8000-<12 digits>
  PREFIX constant text := '9d0c0000-0000-4000-8000-';
  r record;
  v_cli uuid; v_pkg uuid; v_pack uuid; v_closed timestamptz;
  v_mon date := date_trunc('month', current_date)::date;
BEGIN
  SELECT a.id INTO v_user FROM app_user a WHERE a.phone IN (v_phone, '+91' || v_phone, '+' || v_phone) AND a.deleted_at IS NULL LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'no trainer with phone %: sign in once so the row exists', v_phone; END IF;
  SELECT t.id, t.home_tenant_id INTO v_tid, v_ten FROM trainer t WHERE t.app_user_id = v_user AND t.deleted_at IS NULL;
  IF v_tid IS NULL THEN RAISE EXCEPTION 'phone % has no trainer profile yet', v_phone; END IF;
  SELECT currency INTO v_cur FROM tenant WHERE id = v_ten;

  -- ── reset: soft-delete exactly what this script wrote ────────────────────────────────────────
  IF v_reset THEN
    UPDATE payment SET deleted_at = now() WHERE trainer_id = v_tid AND id::text LIKE PREFIX || '%' AND deleted_at IS NULL;
    UPDATE package SET deleted_at = now() WHERE trainer_id = v_tid AND id::text LIKE PREFIX || '%' AND deleted_at IS NULL;
    UPDATE trainer_payout SET deleted_at = now() WHERE trainer_id = v_tid AND id::text LIKE PREFIX || '%' AND deleted_at IS NULL;
    UPDATE gym_arrangement SET deleted_at = now() WHERE trainer_id = v_tid AND id::text LIKE PREFIX || '%' AND deleted_at IS NULL;
    UPDATE pack SET deleted_at = now() WHERE trainer_id = v_tid AND id::text LIKE PREFIX || '%' AND deleted_at IS NULL;
    UPDATE client SET deleted_at = now() WHERE trainer_id = v_tid AND id::text LIKE PREFIX || '%' AND deleted_at IS NULL;
    RAISE NOTICE 'reset: mock money rows soft-deleted for %', v_phone;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pack WHERE id = (PREFIX || '000000000101')::uuid) THEN
    RAISE NOTICE 'already seeded for % — run with reset=1 first to rebuild', v_phone; RETURN;
  END IF;

  -- ── the trainer's gym (only if they have none: never overwrite their own answer) ──────────────
  UPDATE trainer_business
     SET gym_name = coalesce(gym_name, 'Iron House, Indiranagar'),
         training_modes = CASE WHEN training_modes ? 'gym_floor' THEN training_modes ELSE training_modes || '["gym_floor"]'::jsonb END
   WHERE trainer_id = v_tid;

  -- ── price list ──────────────────────────────────────────────────────────────────────────────
  INSERT INTO pack (id, trainer_id, tenant_id, name, service, basis, sessions, validity_days, amount, currency, owner,
                    trainer_share_percent, trainer_share_amount, order_index)
  SELECT (PREFIX || lpad(n::text, 12, '0'))::uuid, v_tid, v_ten, name, service, basis, sessions, validity, amount, v_cur, owner, pct, flat, ord
  FROM (VALUES
    (101, '10 sessions · floor',        'floor',      'sessions', 10,   60,  7500::numeric,  'trainer', NULL::numeric, NULL::numeric, 0),
    (102, '20 sessions · floor',        'floor',      'sessions', 20,  120, 13000,           'trainer', NULL, NULL, 1),
    (103, 'Monthly · online',           'remote',     'period',   NULL, 30,  3000,           'trainer', NULL, NULL, 2),
    (104, '12 sessions · home visits',  'home_visit', 'sessions', 12,   75, 10800,           'trainer', NULL, NULL, 3),
    (105, '8 sessions · gym',           'floor',      'sessions', 8,    60,  8000,           'gym',     60,   NULL, 4),
    (106, '24 sessions · gym',          'floor',      'sessions', 24,  180, 21000,           'gym',     NULL, 12600, 5)
  ) AS p(n, name, service, basis, sessions, validity, amount, owner, pct, flat, ord)
  WHERE NOT EXISTS (SELECT 1 FROM pack x WHERE x.trainer_id = v_tid AND lower(x.name) = lower(p.name) AND x.deleted_at IS NULL);

  -- ── two gym clients (the trainer's other clients are independent) ───────────────────────────
  INSERT INTO client (id, trainer_id, tenant_id, name, client_type)
  VALUES ((PREFIX || '000000000201')::uuid, v_tid, v_ten, 'Ananya Iyer', 'gym'),
         ((PREFIX || '000000000202')::uuid, v_tid, v_ten, 'Rahul Verma', 'gym');

  -- ── sales and their payments ────────────────────────────────────────────────────────────────
  -- One row per package: n, who, which pack, start (days before today), status, sessions left, share override.
  CREATE TEMP TABLE _sale ON COMMIT DROP AS
  SELECT * FROM (VALUES
    -- n   client                    pack  age  status       left  note
    (301, 'Vikram Singh',            102,  150, 'completed',    0),
    (302, 'Priya Nair',              101,  122, 'completed',    0),
    (303, 'Rohan Das',               101,  107, 'completed',    0),
    (304, 'Karthik Menon',           103,   94, 'expired',      NULL),
    (305, 'Meera Iyer',              101,   87, 'completed',    0),
    (306, 'Divya Menon',             103,   63, 'expired',      NULL),
    (307, 'Arjun Reddy',             102,   75, 'active',       6),
    (308, 'Anjali Rao',              104,  115, 'expired',      3),
    (309, 'Farhan Ali',              101,  144, 'refunded',     10),
    (310, 'Karthik Menon',           104,    2, 'active',       12),
    (311, 'Rohan Das',               103,    1, 'active',       NULL),
    (321, 'Ananya Iyer',             105,  120, 'completed',    0),
    (322, 'Ananya Iyer',             106,   87, 'completed',    0),
    (323, 'Ananya Iyer',             106,   18, 'active',       15),
    (324, 'Rahul Verma',             105,   52, 'completed',    0),
    (325, 'Rahul Verma',             105,   13, 'active',       6)
  ) AS s(n, client_name, pack_n, age, status, sessions_left);

  FOR r IN SELECT s.*, p.name AS pname, p.service, p.basis, p.sessions, p.validity_days, p.amount, p.trainer_share_percent AS pct,
                  p.trainer_share_amount AS flat, p.id AS pack_id
           FROM _sale s JOIN pack p ON p.id = (PREFIX || lpad(s.pack_n::text, 12, '0'))::uuid ORDER BY s.n
  LOOP
    SELECT c.id INTO v_cli FROM client c WHERE c.trainer_id = v_tid AND c.name = r.client_name AND c.deleted_at IS NULL
      ORDER BY (c.id::text LIKE PREFIX || '%') DESC LIMIT 1;
    IF v_cli IS NULL THEN RAISE NOTICE 'skip sale %: no client %', r.n, r.client_name; CONTINUE; END IF;
    v_pkg := (PREFIX || lpad(r.n::text, 12, '0'))::uuid;
    v_closed := CASE WHEN r.status = 'active' THEN NULL
                     ELSE ((current_date - r.age) + coalesce(r.validity_days, 30))::timestamptz END;
    -- a closed package must end in the past
    IF v_closed IS NOT NULL AND v_closed > now() THEN v_closed := now() - interval '1 day'; END IF;
    -- a refunded package closed the day it was refunded (the service writes both together; so does the seed)
    IF r.n = 309 THEN v_closed := (current_date - 120)::timestamptz + interval '11 hours'; END IF;

    INSERT INTO package (id, trainer_id, tenant_id, client_id, pack_id, name, service, basis, sessions_total, sessions_remaining,
                         amount, currency, start_date, end_date, due_date, status, closed_at,
                         trainer_share_percent, trainer_share_amount, created_at, updated_at)
    VALUES (v_pkg, v_tid, v_ten, v_cli, r.pack_id, r.pname, r.service, r.basis, r.sessions,
            CASE WHEN r.sessions IS NULL THEN NULL ELSE coalesce(r.sessions_left, 0) END,
            r.amount, v_cur, current_date - r.age, (current_date - r.age) + coalesce(r.validity_days, 30),
            -- due: the sale day, except the two sales whose balance is meant to be late / still to come
            CASE r.n WHEN 307 THEN current_date - 45 WHEN 310 THEN current_date + 12 WHEN 323 THEN current_date + 12 ELSE current_date - r.age END,
            r.status, v_closed, r.pct, r.flat,
            (current_date - r.age)::timestamptz + interval '10 hours', (current_date - r.age)::timestamptz + interval '10 hours');
  END LOOP;

  -- Payments: (id n, sale n, days ago, amount, status, method, reference).  Gym sales take no method:
  -- the gym desk took the money, and the database stamps collected_by from the client's type.
  CREATE TEMP TABLE _pay ON COMMIT DROP AS
  SELECT * FROM (VALUES
    (4001, 301, 150, 7000::numeric, 'paid',      'upi',           'MOCKUPI001'),
    (4002, 301, 136, 6000,          'paid',      'upi',           'MOCKUPI002'),
    (4003, 302, 122, 7500,          'paid',      'cash',          NULL),
    (4004, 303, 107, 4000,          'paid',      'upi',           'MOCKUPI003'),
    (4005, 303,  93, 3500,          'paid',      'upi',           'MOCKUPI004'),
    (4006, 304,  94, 3000,          'paid',      'upi',           'MOCKUPI005'),
    (4007, 305,  87, 7500,          'paid',      'bank_transfer', 'MOCKNEFT001'),
    (4008, 306,  63, 3000,          'paid',      'upi',           'MOCKUPI006'),
    -- 307: part-paid, ₹5,000 expected and now overdue
    (4009, 307,  75, 8000,          'paid',      'cash',          NULL),
    (4010, 307,  75, 5000,          'pending',   'upi',           NULL),
    -- 308: part-paid, the rest forgiven when the client left
    (4011, 308, 115, 6000,          'paid',      'upi',           'MOCKUPI007'),
    (4012, 308,  63, 4800,          'write_off', NULL,            NULL),
    -- 309: paid in full, then refunded
    (4013, 309, 144, 7500,          'paid',      'cash',          NULL),
    (4014, 309, 120, 7500,          'refund',    'cash',          NULL),
    -- this month
    (4015, 310,   2, 5000,          'paid',      'upi',           'MOCKUPI008'),
    (4016, 310,   2, 5800,          'pending',   'upi',           NULL),
    (4017, 311,   1, 3000,          'paid',      'cash',          NULL),
    -- gym-desk money
    (4021, 321, 120, 8000,          'paid',      NULL,            NULL),
    (4022, 322,  87, 10500,         'paid',      NULL,            NULL),
    (4023, 322,  56, 10500,         'paid',      NULL,            NULL),
    (4024, 323,  18, 10500,         'paid',      NULL,            NULL),
    (4025, 323,  18, 10500,         'pending',   NULL,            NULL),
    (4026, 324,  52, 8000,          'paid',      NULL,            NULL),
    (4027, 325,  13, 8000,          'paid',      NULL,            NULL)
  ) AS y(n, sale_n, age, amount, status, method, reference);

  INSERT INTO payment (id, trainer_id, tenant_id, client_id, package_id, amount, currency, collected_by, method, status, reference,
                       paid_at, written_off_at, refunded_at, note, created_at, updated_at)
  SELECT (PREFIX || lpad(y.n::text, 12, '0'))::uuid, v_tid, v_ten, k.client_id, k.id, y.amount, v_cur, 'trainer',
         y.method, y.status, y.reference,
         CASE WHEN y.status = 'paid'      THEN (current_date - y.age)::timestamptz + interval '11 hours' END,
         CASE WHEN y.status = 'write_off' THEN (current_date - y.age)::timestamptz + interval '11 hours' END,
         CASE WHEN y.status = 'refund'    THEN (current_date - y.age)::timestamptz + interval '11 hours' END,
         CASE y.status WHEN 'write_off' THEN 'client left the city' WHEN 'refund' THEN 'moved away' ELSE NULL END,
         (current_date - y.age)::timestamptz + interval '11 hours', (current_date - y.age)::timestamptz + interval '11 hours'
  FROM _pay y JOIN package k ON k.id = (PREFIX || lpad(y.sale_n::text, 12, '0'))::uuid
  ORDER BY y.age DESC, y.n;

  -- ── what the gym owes: terms and what it has paid ───────────────────────────────────────────
  INSERT INTO gym_arrangement (id, trainer_id, tenant_id, gym_name, base_kind, base_amount, currency, starts_month)
  SELECT (PREFIX || '000000000501')::uuid, v_tid, v_ten, b.gym_name, 'minimum', 12000, v_cur, (v_mon - interval '4 months')::date
  FROM trainer_business b WHERE b.trainer_id = v_tid AND b.gym_name IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM gym_arrangement g WHERE g.trainer_id = v_tid AND g.deleted_at IS NULL);

  INSERT INTO trainer_payout (id, trainer_id, tenant_id, gym_name, amount, currency, method, reference, received_at)
  SELECT (PREFIX || lpad(p.n::text, 12, '0'))::uuid, v_tid, v_ten, b.gym_name, p.amount, v_cur, 'bank_transfer', p.ref,
         (current_date - p.age)::timestamptz + interval '15 hours'
  FROM trainer_business b,
       (VALUES (601, 9000::numeric, 'NEFT-MOCK-0701', 85), (602, 12000, 'NEFT-MOCK-0812', 52), (603, 12000, 'NEFT-MOCK-0910', 23)) AS p(n, amount, ref, age)
  WHERE b.trainer_id = v_tid AND b.gym_name IS NOT NULL
    AND EXISTS (SELECT 1 FROM gym_arrangement g WHERE g.trainer_id = v_tid AND g.deleted_at IS NULL);

  RAISE NOTICE 'seeded mock money for % (trainer %)', v_phone, v_tid;
END
$mock$;

COMMIT;

-- What it wrote, as the Business pages will read it.
SELECT 'packs'    AS what, count(*) FROM pack    WHERE id::text LIKE '9d0c0000-0000-4000-8000-%' AND deleted_at IS NULL
UNION ALL SELECT 'clients',  count(*) FROM client  WHERE id::text LIKE '9d0c0000-0000-4000-8000-%' AND deleted_at IS NULL
UNION ALL SELECT 'packages', count(*) FROM package WHERE id::text LIKE '9d0c0000-0000-4000-8000-%' AND deleted_at IS NULL
UNION ALL SELECT 'payments', count(*) FROM payment WHERE id::text LIKE '9d0c0000-0000-4000-8000-%' AND deleted_at IS NULL
UNION ALL SELECT 'payouts',  count(*) FROM trainer_payout WHERE id::text LIKE '9d0c0000-0000-4000-8000-%' AND deleted_at IS NULL;
