-- Counting a use of an InclineYou library program ("Use this", Programs A4).
--
-- certified_program is catalogue data: V1's policy lets only app_actor() = 'system' write
-- it, and a request is never the system, so an UPDATE from the request path matches zero
-- rows and says nothing. The count still has to move when a trainer copies a library
-- program, so this is the one door: a function owned by the migration role (which RLS does
-- not apply to) that can do exactly one thing — add one to one row's used_count. It touches
-- no other column and no program.revised_at, which is why used_count lives in its own table.

CREATE FUNCTION certified_program_count_use(p_program_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = public
    AS $$ UPDATE certified_program SET used_count = used_count + 1 WHERE program_id = p_program_id $$;

REVOKE ALL ON FUNCTION certified_program_count_use(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION certified_program_count_use(uuid) TO inclineyou_app;
