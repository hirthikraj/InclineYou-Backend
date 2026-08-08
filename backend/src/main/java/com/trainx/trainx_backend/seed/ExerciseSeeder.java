package com.trainx.trainx_backend.seed;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.trainx.trainx_backend.config.AppProperties;
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
 * Seeds the shared exercise library from free-exercise-db on startup.
 *
 * <p>Idempotent: rows are keyed by {@code source_id} and the upsert only writes when a
 * field actually changed, so restarting the app doesn't churn {@code updated_at} and
 * push 873 unchanged exercises down every device's sync cursor.
 *
 * <p>Seeded rows have {@code is_custom = false} and {@code trainer_id = NULL}, which is
 * what makes them visible to every trainer in {@code SyncService.fetchExercises}.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ExerciseSeeder implements ApplicationRunner {

    private static final String SEED_SOURCE = "free-exercise-db";
    private static final int BATCH_SIZE = 200;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AppProperties props;

    /** free-exercise-db's record shape. Unknown fields are ignored (tolerant reader). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record SeedExercise(
            String id,
            String name,
            String force,
            String level,
            String mechanic,
            String equipment,
            List<String> primaryMuscles,
            List<String> secondaryMuscles,
            List<String> instructions,
            String category,
            List<String> images
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

        int written = upsert(seed, cfg.getImageBaseUrl());
        long total = countSeeded();
        log.info("Exercise library seeded: {} rows changed, {} seeded exercises in total", written, total);
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

    private static final String UPSERT_SQL = """
            INSERT INTO exercise (
                id, name, muscle_group, equipment, movement_pattern, description,
                image_url, level, metadata, is_custom, trainer_id, source_id,
                created_at, updated_at
            )
            VALUES (
                gen_random_uuid(), :name, :muscle_group, :equipment, :movement_pattern, :description,
                :image_url, :level, CAST(:metadata AS jsonb), false, NULL, :source_id,
                NOW(), NOW()
            )
            ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
                name             = EXCLUDED.name,
                muscle_group     = EXCLUDED.muscle_group,
                equipment        = EXCLUDED.equipment,
                movement_pattern = EXCLUDED.movement_pattern,
                description      = EXCLUDED.description,
                image_url        = EXCLUDED.image_url,
                level            = EXCLUDED.level,
                metadata         = EXCLUDED.metadata,
                deleted_at       = NULL
            WHERE exercise.name             IS DISTINCT FROM EXCLUDED.name
               OR exercise.muscle_group     IS DISTINCT FROM EXCLUDED.muscle_group
               OR exercise.equipment        IS DISTINCT FROM EXCLUDED.equipment
               OR exercise.movement_pattern IS DISTINCT FROM EXCLUDED.movement_pattern
               OR exercise.description      IS DISTINCT FROM EXCLUDED.description
               OR exercise.image_url        IS DISTINCT FROM EXCLUDED.image_url
               OR exercise.level            IS DISTINCT FROM EXCLUDED.level
               OR exercise.metadata         IS DISTINCT FROM EXCLUDED.metadata
               OR exercise.deleted_at       IS NOT NULL
            """;

    private int upsert(List<SeedExercise> seed, String imageBaseUrl) throws Exception {
        int written = 0;
        for (int start = 0; start < seed.size(); start += BATCH_SIZE) {
            var batch = seed.subList(start, Math.min(start + BATCH_SIZE, seed.size()));
            var params = new SqlParameterSource[batch.size()];
            for (int i = 0; i < batch.size(); i++) {
                params[i] = toParams(batch.get(i), imageBaseUrl);
            }
            for (int rows : jdbc.batchUpdate(UPSERT_SQL, params)) {
                written += rows;
            }
        }
        return written;
    }

    private SqlParameterSource toParams(SeedExercise e, String imageBaseUrl) throws Exception {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("source", SEED_SOURCE);
        if (e.mechanic() != null) metadata.put("mechanic", e.mechanic());
        if (e.category() != null) metadata.put("category", e.category());
        if (notEmpty(e.secondaryMuscles())) metadata.put("secondaryMuscles", e.secondaryMuscles());
        if (notEmpty(e.images())) metadata.put("images", absoluteImageUrls(e.images(), imageBaseUrl));

        return new MapSqlParameterSource()
                .addValue("name", e.name())
                .addValue("muscle_group", first(e.primaryMuscles()))
                .addValue("equipment", e.equipment())
                // free-exercise-db's `force` is push/pull/static; fall back to the
                // category (cardio, stretching, …) when force is absent.
                .addValue("movement_pattern", e.force() != null ? e.force() : e.category())
                .addValue("description", notEmpty(e.instructions())
                        ? String.join("\n\n", e.instructions()) : null)
                .addValue("image_url", notEmpty(e.images())
                        ? imageUrl(e.images().get(0), imageBaseUrl) : null)
                .addValue("level", e.level())
                .addValue("metadata", objectMapper.writeValueAsString(metadata))
                .addValue("source_id", e.id());
    }

    private List<String> absoluteImageUrls(List<String> paths, String base) {
        return paths.stream().map(p -> imageUrl(p, base)).toList();
    }

    private String imageUrl(String path, String base) {
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        return base.endsWith("/") ? base + path : base + "/" + path;
    }

    private static boolean notEmpty(List<String> list) {
        return list != null && !list.isEmpty();
    }

    private static String first(List<String> list) {
        return notEmpty(list) ? list.get(0) : null;
    }

    private long countSeeded() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM exercise WHERE source_id IS NOT NULL AND deleted_at IS NULL",
                Map.of(), Long.class);
        return n == null ? 0 : n;
    }
}
