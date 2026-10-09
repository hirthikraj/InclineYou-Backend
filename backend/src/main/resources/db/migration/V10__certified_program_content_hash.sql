-- Certified programs are seeded by the application (CertifiedSeeder, 6 Oct 2026), from seed/certified-programs.json,
-- naming each movement by its library id. Additive only: one nullable column.
--
-- content_hash is a SHA-256 of the program as the seeder resolved it (its days, movements, sets and the set kinds each
-- movement's log type gives). The seeder compares it on every boot and rewrites a program ONLY when it changed.
-- That matters because a trainer's copy points back at the shelf program (copied_from_program_id) and its workouts
-- (copied_from_workout_id): rewriting every boot would churn revised_at, and revised_at is what tells every copy it is
-- "behind". An unchanged program is left exactly as it is, including used_count.
-- NULL means "never seeded by the seeder" (a row from an older seed script), which the seeder treats as changed.

ALTER TABLE certified_program ADD COLUMN content_hash varchar(64);
