# Archived migrations — not run

The baseline `V1__init_schema.sql` and `V2`–`V22` as they stood on 25 Sep 2026,
before the schema was rebuilt from scratch. They are kept for reference only:
Flyway reads `src/main/resources/db/migration/`, not this folder.

The replacement is a fresh `V1__init_schema.sql` that builds exactly the 41 v1
tables agreed in `release/proposed-schema.html`. Tables held for a later release
are described in `release/later-schema.html`. `V4`–`V22` were never committed to
git, so this folder is their only copy.
