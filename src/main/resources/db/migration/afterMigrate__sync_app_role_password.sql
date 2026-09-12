-- Keeps `inclineyou_app`'s password in step with APP_DB_PASSWORD.
--
-- V42 creates the role and sets its password, but a versioned migration runs
-- exactly once. On every database that has already migrated, changing
-- APP_DB_PASSWORD therefore changed nothing at all — the pool would pick up the
-- new value, the role would keep the old one, and the first evidence was the
-- app failing to start with `password authentication failed for user
-- "inclineyou_app"`. Rotating the credential looked like it worked right up until the
-- next deploy.
--
-- An `afterMigrate` callback runs on EVERY startup, not only when a migration
-- applies, and it runs on Flyway's connection — the owner's — which is the only
-- identity in the system that may ALTER a role. So the environment becomes the
-- authority on that password, and reconciliation happens before Hibernate opens
-- the pool.
--
-- It is deliberately a no-op when APP_DB_PASSWORD is unset. `appRolePassword`
-- carries a development default so `./mvnw spring-boot:run` works out of the
-- box; writing that default onto the role on every boot would mean a production
-- deployment that simply forgot the variable would have its runtime login
-- quietly reset to a password published in this repository. Failing to boot is
-- the better of those two outcomes, so an unset variable leaves the role alone.
DO $$
DECLARE
    configured text := '${appRolePasswordExplicit}';
BEGIN
    IF configured = '' THEN
        RETURN;
    END IF;

    BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inclineyou_app') THEN
            EXECUTE format('ALTER ROLE inclineyou_app LOGIN PASSWORD %L', configured);
        ELSE
            EXECUTE format('CREATE ROLE inclineyou_app LOGIN PASSWORD %L', configured);
        END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        -- A managed Postgres may not grant CREATEROLE to the migration user.
        -- Say so rather than failing the boot: the role may well be correct
        -- already, and if it is not, the connection error two seconds from now
        -- is a clearer message than this one would be.
        RAISE WARNING 'could not set the password on inclineyou_app — the migration role lacks the privilege; rotate it manually';
    END;
END $$;
