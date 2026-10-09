package com.inclineyou.inclineyou_backend.infrastructure.seed;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
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
 * Seeds the shared exercise library from {@code seed/exercises.json} on startup.
 *
 * <p>That file is built, not written: {@code scripts/build-exercise-seed.py} produces it from the library we author
 * ourselves in {@code exercise-library/exercises-india.json} — one equipment and one muscle at a time, for Indian
 * trainers. It replaced the upstream hasaneyldrm dataset on 6 Oct 2026, whose names and steps traced back to
 * Gym visual material we have no licence for. Text only: no image or video column exists.
 *
 * <p><b>The file is authoritative.</b> Rows are keyed by {@code source_id} ({@code inclineyou-<id>}), written
 * only when a field actually changed (so a restart does not churn {@code updated_at}, which is the exercise's
 * ETag), and an {@code inclineyou} exercise whose id is no longer in the file is retired with {@code deleted_at}
 * — never deleted, because a plan or a past log may still hold its id and must keep resolving the name.
 *
 * <p>What it fills that the upstream seed left empty: {@code level}, {@code movement_pattern}, {@code log_type}
 * (V9 widened it), {@code secondary_targets} and {@code form_cues}. {@code equipment_id} is not written here: a
 * trigger resolves it from {@code equipment_alias}, so a new equipment string needs a row there and nothing in
 * this class. Every entry is still a draft until its {@code review} status says otherwise; that status rides in
 * {@code metadata} so a later build can tell reviewed exercises from unreviewed ones.
 *
 * <p>Seeded rows have {@code origin = 'inclineyou'} and {@code trainer_id = NULL}, which makes them visible to
 * every trainer.
 */
@Component
@Order(1)   // before CertifiedSeeder: the starter programs name these exercises
@RequiredArgsConstructor
@Slf4j
public class ExerciseSeeder implements ApplicationRunner {

    private static final String SEED_SOURCE = "inclineyou-library";

    /** Prefix on {@code source_id}: keeps our ids apart from any other source's and from a trainer's own. */
    private static final String SOURCE_PREFIX = "inclineyou-";

    private static final int BATCH_SIZE = 200;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AppProperties props;

    /**
     * The seed's record shape — see {@code scripts/build-exercise-seed.py}. Unknown fields are ignored (tolerant
     * reader), which lets the script add a field ahead of the code that reads it.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record SeedExercise(
            String id,
            String name,
            String bodyPart,
            /** The primary muscle: "pectorals", "quads". Lands in {@code muscle_group} and {@code target}. */
            String target,
            List<String> secondaryTargets,
            String equipment,
            String movementPattern,
            String level,
            String logType,
            /** Alternate English names. No column yet, so they ride in {@code metadata} and are searchable later. */
            List<String> aliases,
            /** Ordered, already split; stored joined by blank lines, which is what the app's step parser splits on. */
            List<String> steps,
            List<String> formCues,
            /** commonMistakes, safety, reviewNote, equipmentNeeded, category, review. */
            Map<String, Object> metadata
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
            // Never retire the library because a file went missing or came back empty.
            log.warn("Exercise seed file {} was empty — nothing to seed", cfg.getResource());
            return;
        }

        // The global library belongs to no workspace, and since V21 no request may write it — only the SYSTEM
        // actor. Declared here, and cleared in the same breath, so it cannot outlive the seed on this thread.
        int written, retired;
        TenantContext.set(TenantContext.SYSTEM);
        try {
            written = upsert(seed);
            retired = retireMissing(seed);
        } finally {
            TenantContext.clear();
        }
        log.info("Exercise library seeded: {} rows changed, {} retired, {} seeded exercises in total (text only)",
                written, retired, countSeeded());
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
     * The fresh baseline never had media columns and the library stays text only. {@code origin = 'inclineyou'}
     * requires {@code trainer_id} and {@code tenant_id} NULL and {@code source_id} NOT NULL
     * ({@code exercise_origin_ownership}). {@code deleted_at = NULL} on conflict revives a row that was retired
     * and then came back into the file.
     */
    private static final String UPSERT_SQL = """
            INSERT INTO exercise (
                id, name, muscle_group, body_part, target, equipment, movement_pattern, description, level,
                log_type, secondary_targets, form_cues, metadata, origin, trainer_id, source_id, created_at, updated_at
            )
            VALUES (
                gen_random_uuid(), :name, :target, :body_part, :target, :equipment, :movement_pattern, :description, :level,
                :log_type, CAST(:secondary_targets AS jsonb), CAST(:form_cues AS jsonb), CAST(:metadata AS jsonb),
                'inclineyou', NULL, :source_id, NOW(), NOW()
            )
            ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
                name              = EXCLUDED.name,
                muscle_group      = EXCLUDED.muscle_group,
                body_part         = EXCLUDED.body_part,
                target            = EXCLUDED.target,
                equipment         = EXCLUDED.equipment,
                movement_pattern  = EXCLUDED.movement_pattern,
                description       = EXCLUDED.description,
                level             = EXCLUDED.level,
                log_type          = EXCLUDED.log_type,
                secondary_targets = EXCLUDED.secondary_targets,
                form_cues         = EXCLUDED.form_cues,
                metadata          = EXCLUDED.metadata,
                deleted_at        = NULL
            WHERE exercise.name              IS DISTINCT FROM EXCLUDED.name
               OR exercise.muscle_group      IS DISTINCT FROM EXCLUDED.muscle_group
               OR exercise.body_part         IS DISTINCT FROM EXCLUDED.body_part
               OR exercise.target            IS DISTINCT FROM EXCLUDED.target
               OR exercise.equipment         IS DISTINCT FROM EXCLUDED.equipment
               OR exercise.movement_pattern  IS DISTINCT FROM EXCLUDED.movement_pattern
               OR exercise.description       IS DISTINCT FROM EXCLUDED.description
               OR exercise.level             IS DISTINCT FROM EXCLUDED.level
               OR exercise.log_type          IS DISTINCT FROM EXCLUDED.log_type
               OR exercise.secondary_targets IS DISTINCT FROM EXCLUDED.secondary_targets
               OR exercise.form_cues         IS DISTINCT FROM EXCLUDED.form_cues
               OR exercise.metadata          IS DISTINCT FROM EXCLUDED.metadata
               OR exercise.deleted_at        IS NOT NULL
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

    /** Anything of ours that the file no longer lists is retired, not deleted. */
    private int retireMissing(List<SeedExercise> seed) {
        List<String> ids = seed.stream().map(e -> SOURCE_PREFIX + e.id()).toList();   // a List expands to IN (?, ?, …)
        return jdbc.update("""
                UPDATE exercise SET deleted_at = NOW()
                WHERE origin = 'inclineyou' AND deleted_at IS NULL AND source_id NOT IN (:ids)
                """, new MapSqlParameterSource("ids", ids));
    }

    private SqlParameterSource toParams(SeedExercise e) throws Exception {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("source", SEED_SOURCE);
        if (e.aliases() != null && !e.aliases().isEmpty()) metadata.put("aliases", e.aliases());
        if (e.metadata() != null) metadata.putAll(e.metadata());

        return new MapSqlParameterSource()
                .addValue("name", e.name())
                // The primary muscle. `muscle_group` keeps the meaning it has always had, so search,
                // /exercises/meta and custom exercises are untouched.
                .addValue("target", e.target())
                .addValue("body_part", e.bodyPart())
                .addValue("equipment", e.equipment())
                .addValue("movement_pattern", e.movementPattern())
                .addValue("level", e.level())
                .addValue("log_type", e.logType())
                // Blank-line separated, which is what the app's step parser splits on.
                .addValue("description", notEmpty(e.steps()) ? String.join("\n\n", e.steps()) : null)
                .addValue("secondary_targets", objectMapper.writeValueAsString(e.secondaryTargets() == null ? List.of() : e.secondaryTargets()))
                .addValue("form_cues", objectMapper.writeValueAsString(e.formCues() == null ? List.of() : e.formCues()))
                .addValue("metadata", objectMapper.writeValueAsString(metadata))
                .addValue("source_id", SOURCE_PREFIX + e.id());
    }

    private static boolean notEmpty(List<String> list) {
        return list != null && !list.isEmpty();
    }

    private long countSeeded() {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM exercise WHERE origin = 'inclineyou' AND deleted_at IS NULL",
                Map.of(), Long.class);
        return n == null ? 0 : n;
    }
}
