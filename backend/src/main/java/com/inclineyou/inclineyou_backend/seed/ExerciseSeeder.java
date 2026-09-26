package com.inclineyou.inclineyou_backend.seed;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.inclineyou.inclineyou_backend.config.AppProperties;
import com.inclineyou.inclineyou_backend.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Seeds the shared exercise library from hasaneyldrm/exercises-dataset on startup.
 *
 * <p>1,324 exercises: names, body parts, equipment, target muscles and ordered
 * step-by-step instructions.
 *
 * <p><b>Text only, deliberately.</b> Upstream also ships a 180×180 thumbnail and a
 * 180×180 animation GIF per exercise, and neither is seeded. The split in that
 * repository's licence is the whole reason: the data is MIT and ours to use, while
 * the media — <em>both</em> the stills and the GIFs, which are frames of the same
 * artwork — is {@code © Gym visual — https://gymvisual.com/}, redistributed there
 * under a written permission granted to that repository rather than to anyone who
 * clones it. Shipping it needs our own licence, so until there is one the seeder
 * takes the half that was actually offered. See V22 for the retirement of the
 * media that was briefly seeded, and {@code scripts/build-exercise-seed.py}, which
 * drops the paths before they ever reach the classpath.
 *
 * <p>Idempotent: rows are keyed by {@code source_id} and the upsert only writes when
 * a field actually changed, so restarting the app doesn't churn {@code updated_at}
 * and push 1,324 unchanged exercises down every device's sync cursor.
 *
 * <p>Seeded rows have {@code is_custom = false} and {@code trainer_id = NULL}, which is
 * what makes them visible to every trainer in {@code SyncService.fetchExercises}.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ExerciseSeeder implements ApplicationRunner {

    private static final String SEED_SOURCE = "exercises-dataset";

    /**
     * Prefix on {@code source_id}. Upstream's ids are bare four-digit strings
     * ("0001"), which say nothing about where they came from and could collide
     * with a future seed. The prefix also keeps V21's retirement of the old
     * library unambiguous: everything it soft-deleted has an unprefixed slug.
     */
    private static final String SOURCE_PREFIX = "gymvisual-";

    private static final int BATCH_SIZE = 200;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AppProperties props;

    /**
     * The trimmed seed's record shape — see {@code scripts/build-exercise-seed.py}.
     * Unknown fields are ignored (tolerant reader), which is what lets the script
     * add a field ahead of the code that reads it.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record SeedExercise(
            String id,
            String name,
            String bodyPart,
            String equipment,
            /** The primary muscle: "abs", "biceps". Lands in {@code muscle_group}. */
            String target,
            /** The synergist: "hip flexors". Metadata — finer than the library screen needs. */
            String synergist,
            List<String> secondaryMuscles,
            /** Ordered, already split. English only until the app speaks anything else. */
            List<String> steps
    ) {}

    @Override
    public void run(ApplicationArguments args) throws Exception {
        var cfg = props.getSeed().getExercises();
        if (!cfg.isEnabled()) {
            log.info("Exercise seeding disabled (app.seed.exercises.enabled=false)");
            return;
        }

        List<SeedExercise> seed = load(cfg.getResource());
        if (seed.isEmpty()) {
            log.warn("Exercise seed file {} was empty — nothing to seed", cfg.getResource());
            return;
        }

        // The global library belongs to no workspace, and since V21 no request
        // may write it — only the SYSTEM actor. Declared here, and cleared in the
        // same breath, so it cannot outlive the seed on this thread.
        int written;
        TenantContext.set(TenantContext.SYSTEM);
        try {
            written = upsert(seed);
        } finally {
            TenantContext.clear();
        }
        long total = countSeeded();
        log.info("Exercise library seeded: {} rows changed, {} seeded exercises in total (text only — "
                + "no media, pending a Gym visual licence)", written, total);
    }

    private List<SeedExercise> load(String resourcePath) throws Exception {
        var resource = new ClassPathResource(resourcePath);
        if (!resource.exists()) {
            log.warn("Exercise seed file {} not found on the classpath — skipping seed", resourcePath);
            return List.of();
        }
        try (InputStream in = resource.getInputStream()) {
            return objectMapper.readValue(in, new TypeReference<List<SeedExercise>>() {});
        }
    }

    /**
     * {@code image_url} and {@code video_url} are written as literal NULLs rather
     * than left out of the statement. Leaving them out would mean a row seeded
     * before the media came out keeps its URLs forever, because {@code ON CONFLICT}
     * only overwrites the columns it names — so the seeder would depend on V22
     * having run to stay correct. Naming them makes "a seeded exercise carries no
     * media" true of the code that owns these rows, including on a database
     * restored from an older dump.
     */
    private static final String UPSERT_SQL = """
            INSERT INTO exercise (
                id, name, muscle_group, body_part, target, equipment, movement_pattern,
                description, image_url, video_url, level, metadata, is_custom, trainer_id,
                source_id, created_at, updated_at
            )
            VALUES (
                gen_random_uuid(), :name, :muscle_group, :body_part, :target, :equipment, NULL,
                :description, NULL, NULL, NULL, CAST(:metadata AS jsonb), false, NULL,
                :source_id, NOW(), NOW()
            )
            ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
                name         = EXCLUDED.name,
                muscle_group = EXCLUDED.muscle_group,
                body_part    = EXCLUDED.body_part,
                target       = EXCLUDED.target,
                equipment    = EXCLUDED.equipment,
                description  = EXCLUDED.description,
                image_url    = NULL,
                video_url    = NULL,
                metadata     = EXCLUDED.metadata,
                deleted_at   = NULL
            WHERE exercise.name         IS DISTINCT FROM EXCLUDED.name
               OR exercise.muscle_group IS DISTINCT FROM EXCLUDED.muscle_group
               OR exercise.body_part    IS DISTINCT FROM EXCLUDED.body_part
               OR exercise.target       IS DISTINCT FROM EXCLUDED.target
               OR exercise.equipment    IS DISTINCT FROM EXCLUDED.equipment
               OR exercise.description  IS DISTINCT FROM EXCLUDED.description
               OR exercise.image_url    IS NOT NULL
               OR exercise.video_url    IS NOT NULL
               OR exercise.metadata     IS DISTINCT FROM EXCLUDED.metadata
               OR exercise.deleted_at   IS NOT NULL
            """;

    private int upsert(List<SeedExercise> seed) throws Exception {
        int written = 0;
        for (int start = 0; start < seed.size(); start += BATCH_SIZE) {
            var batch = seed.subList(start, Math.min(start + BATCH_SIZE, seed.size()));
            var params = new SqlParameterSource[batch.size()];
            for (int i = 0; i < batch.size(); i++) {
                params[i] = toParams(batch.get(i));
            }
            for (int rows : jdbc.batchUpdate(UPSERT_SQL, params)) {
                written += rows;
            }
        }
        return written;
    }

    private SqlParameterSource toParams(SeedExercise e) throws Exception {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("source", SEED_SOURCE);
        if (e.synergist() != null) metadata.put("synergist", e.synergist());
        if (notEmpty(e.secondaryMuscles())) metadata.put("secondaryMuscles", e.secondaryMuscles());

        return new MapSqlParameterSource()
                .addValue("name", displayName(e.name()))
                // The primary muscle. `muscle_group` keeps the meaning it has always
                // had, so search, /exercises/meta and custom exercises are untouched.
                .addValue("muscle_group", e.target())
                .addValue("body_part", e.bodyPart())
                .addValue("target", e.target())
                .addValue("equipment", e.equipment())
                // Blank-line separated, which is what the app's step parser splits on.
                // The source is already an ordered array, so nothing has to be guessed
                // back out of prose.
                .addValue("description", notEmpty(e.steps()) ? String.join("\n\n", e.steps()) : null)
                .addValue("metadata", objectMapper.writeValueAsString(metadata))
                .addValue("source_id", SOURCE_PREFIX + e.id());
    }

    /**
     * Upstream names are all lower case — "barbell bench press", "3/4 sit-up".
     * Rendered as-is they read as unfinished next to a trainer's own "Ananya's
     * shoulder rehab", so the first letter is raised and nothing else is touched.
     *
     * <p>Deliberately not title case: the names carry "(male)", "v. 2", "EZ barbell"
     * and "45°", and a per-word capitaliser mangles all four to fix one.
     */
    private static String displayName(String name) {
        if (name == null || name.isBlank()) return name;
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    private static boolean notEmpty(List<String> list) {
        return list != null && !list.isEmpty();
    }

    private long countSeeded() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM exercise WHERE source_id IS NOT NULL AND deleted_at IS NULL",
                Map.of(), Long.class);
        return n == null ? 0 : n;
    }
}
