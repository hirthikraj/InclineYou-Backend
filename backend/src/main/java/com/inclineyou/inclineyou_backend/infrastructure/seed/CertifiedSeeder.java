package com.inclineyou.inclineyou_backend.infrastructure.seed;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.inclineyou.inclineyou_backend.core.exercise.LogTypes;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Seeds the InclineYou starter programs — the shelf a trainer copies from — out of {@code seed/certified-programs.json}.
 *
 * <p>A migration cannot name a library exercise: {@code exercise.id} is minted by {@link ExerciseSeeder} after Flyway
 * runs. So this runs after it ({@code @Order(2)}), and the file names each movement by its library id
 * ({@code source_id = 'inclineyou-' + ex}), which is stable across rebuilds of the library.
 *
 * <p><b>What it writes.</b> A {@code program} with {@code origin = 'inclineyou'}, its {@code certified_program} row,
 * and one workout per training day for <b>week 1 only</b> — a week with nothing of its own repeats week 1 in the
 * builder, which is what lets an eight-week block exist without a blank grid. Each movement's sets take their kinds
 * from its library {@code log_type} ({@link LogTypes#kindsOf}): a plank is bodyweight × seconds, a farmer's walk is a
 * weight × metres, a squat is a weight × reps with the weight left for the coach to fill in per client.
 *
 * <p><b>Idempotent, and careful with copies.</b> Program and workout ids are fixed (a name-based UUID of the slug), so
 * a re-run changes nothing. A program is rewritten only when {@code content_hash} says its content changed, because a
 * trainer's copy points back at the shelf program and its workouts and {@code program.revised_at} is what marks every
 * copy as behind: workouts are updated in place and their exercises replaced, never re-created. {@code used_count}
 * and a reviewer's {@code is_sample = false} are never touched. A program that leaves the file is retired
 * ({@code deleted_at}), not deleted.
 *
 * <p>Every program is seeded as a <b>sample</b> ({@code is_sample = true}, {@code reviewed_at} NULL): written by us,
 * not yet signed off by a qualified trainer. The schema's {@code certified_program_sample} check refuses a reviewed
 * sample, so marking one reviewed is a deliberate act by a person, in a migration or an admin tool, not this class.
 *
 * <p>Runs as the SYSTEM actor — the catalogue policies on {@code program}, {@code workout}, {@code workout_exercise},
 * {@code workout_set} and {@code certified_program} admit it, and nothing else, to write rows with no tenant.
 */
@Component
@Order(2)
@RequiredArgsConstructor
@Slf4j
public class CertifiedSeeder implements ApplicationRunner {

    private static final String SOURCE_PREFIX = "inclineyou-";
    private static final String ID_NAMESPACE = "inclineyou-certified:";

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final AppProperties props;
    private final PlatformTransactionManager transactions;

    /** One movement in a day: library id, sets, the value each set asks for (reps, seconds or metres), rest. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record SeedExercise(String ex, int sets, int value, int rest, String section) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record SeedDay(String name, List<SeedExercise> exercises) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    record SeedProgram(String slug, String name, String goal, int weeks, String level, String equipment,
                       String summary, List<SeedDay> days) {}

    /** A library exercise as the seeder needs it. */
    private record Lib(UUID id, String logType) {}

    @Override
    public void run(ApplicationArguments args) throws Exception {
        var cfg = props.getSeed().getCertified();
        if (!cfg.isEnabled()) {
            log.info("Certified-program seeding disabled (app.seed.certified.enabled=false)");
            return;
        }
        List<SeedProgram> seed = load(cfg.getResource());
        if (seed.isEmpty()) {
            // Never retire the shelf because a file went missing or came back empty.
            log.warn("Certified-program seed file {} was empty — nothing to seed", cfg.getResource());
            return;
        }

        int written = 0, unchanged = 0, skipped = 0, retired;
        TenantContext.set(TenantContext.SYSTEM);
        try {
            Map<String, Lib> library = library(seed);
            var tx = new TransactionTemplate(transactions);
            var ids = new ArrayList<UUID>();
            for (SeedProgram p : seed) {
                ids.add(programId(p.slug()));
                List<String> missing = missing(p, library);
                if (!missing.isEmpty()) {
                    // The library is not there (or was edited): leave the program as it is rather than half-write it.
                    log.error("Certified program '{}' skipped — not in the exercise library: {}", p.slug(), missing);
                    skipped++;
                    continue;
                }
                String hash = hash(p, library);
                if (hash.equals(storedHash(programId(p.slug())))) {
                    unchanged++;
                    continue;
                }
                tx.executeWithoutResult(status -> write(p, library, hash));
                written++;
            }
            retired = retire(ids);
        } finally {
            TenantContext.clear();
        }
        log.info("Certified programs seeded: {} written, {} unchanged, {} skipped, {} retired", written, unchanged, skipped, retired);
    }

    private List<SeedProgram> load(String resourcePath) throws Exception {
        var resource = new ClassPathResource(resourcePath);
        if (!resource.exists()) {
            log.warn("Certified-program seed file {} not found on the classpath — skipping", resourcePath);
            return List.of();
        }
        try (InputStream in = resource.getInputStream()) {
            return objectMapper.readValue(in, new TypeReference<List<SeedProgram>>() {});
        }
    }

    /** Every library exercise the file names, by its library id. */
    private Map<String, Lib> library(List<SeedProgram> seed) {
        List<String> sources = seed.stream().flatMap(p -> p.days().stream()).flatMap(d -> d.exercises().stream())
                .map(e -> SOURCE_PREFIX + e.ex()).distinct().toList();
        var out = new HashMap<String, Lib>();
        jdbc.query("SELECT source_id, id, log_type FROM exercise WHERE origin = 'inclineyou' AND deleted_at IS NULL"
                        + " AND source_id IN (:sources)", new MapSqlParameterSource("sources", sources),
                rs -> {
                    out.put(rs.getString("source_id").substring(SOURCE_PREFIX.length()),
                            new Lib(UUID.fromString(rs.getString("id")), rs.getString("log_type")));
                });
        return out;
    }

    private static List<String> missing(SeedProgram p, Map<String, Lib> library) {
        return p.days().stream().flatMap(d -> d.exercises().stream()).map(SeedExercise::ex)
                .filter(id -> !library.containsKey(id)).distinct().toList();
    }

    /** The program as resolved — content plus the set kinds the library gives each movement — so a changed log type rewrites it. */
    private String hash(SeedProgram p, Map<String, Lib> library) throws Exception {
        var resolved = new ArrayList<Object>();
        resolved.add(List.of(p.name(), p.goal(), p.weeks(), p.level(), p.equipment(), p.summary()));
        for (SeedDay d : p.days()) {
            var day = new ArrayList<Object>();
            day.add(d.name());
            for (SeedExercise e : d.exercises()) {
                var k = LogTypes.kindsOf(library.get(e.ex()).logType());
                day.add(List.of(e.ex(), e.sets(), e.value(), e.rest(), String.valueOf(e.section()), k.loadKind(), k.effortKind()));
            }
            resolved.add(day);
        }
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsString(resolved).getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().formatHex(digest);
    }

    private String storedHash(UUID programId) {
        return jdbc.query("""
                SELECT cp.content_hash FROM certified_program cp JOIN program pr ON pr.id = cp.program_id
                WHERE cp.program_id = :id::uuid AND pr.deleted_at IS NULL
                """, new MapSqlParameterSource("id", programId.toString()),
                rs -> rs.next() ? rs.getString(1) : null);
    }

    private void write(SeedProgram p, Map<String, Lib> library, String hash) {
        UUID programId = programId(p.slug());
        var pp = new MapSqlParameterSource("id", programId.toString()).addValue("name", p.name()).addValue("goal", p.goal())
                .addValue("summary", p.summary()).addValue("weeks", p.weeks()).addValue("days", p.days().size())
                .addValue("level", p.level()).addValue("equipment", p.equipment()).addValue("hash", hash);

        // revised_at moves here, and only here: this is a changed program, and every copy of it is now behind.
        jdbc.update("""
                INSERT INTO program (id, origin, name, goal, description, weeks, days)
                VALUES (:id::uuid, 'inclineyou', :name, :goal, :summary, :weeks, :days)
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, goal = EXCLUDED.goal, description = EXCLUDED.description,
                    weeks = EXCLUDED.weeks, days = EXCLUDED.days, revised_at = NOW(), deleted_at = NULL
                """, pp);
        // used_count and is_sample are left alone on conflict: one is the shelf's popularity, the other a reviewer's call.
        jdbc.update("""
                INSERT INTO certified_program (program_id, summary, level, equipment, is_sample, content_hash)
                VALUES (:id::uuid, :summary, :level, :equipment, true, :hash)
                ON CONFLICT (program_id) DO UPDATE SET summary = EXCLUDED.summary, level = EXCLUDED.level,
                    equipment = EXCLUDED.equipment, content_hash = EXCLUDED.content_hash
                """, pp);

        for (int i = 0; i < p.days().size(); i++) {
            SeedDay day = p.days().get(i);
            UUID workoutId = workoutId(p.slug(), i + 1);
            // Updated in place, never re-created: a trainer's copy holds copied_from_workout_id.
            jdbc.update("""
                    INSERT INTO workout (id, origin, program_id, week, day, position, name)
                    VALUES (:w::uuid, 'inclineyou', :p::uuid, 1, :day, 0, :name)
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL
                    """, new MapSqlParameterSource("w", workoutId.toString()).addValue("p", programId.toString())
                    .addValue("day", i + 1).addValue("name", day.name()));
            // Its movements are replaced; the sets go with them (cascade) and a session's planned_from just goes NULL.
            jdbc.update("DELETE FROM workout_exercise WHERE workout_id = :w::uuid", Map.of("w", workoutId.toString()));
            writeExercises(workoutId, day, library);
        }
        // A day that left the plan: retire its workout.
        jdbc.update("UPDATE workout SET deleted_at = NOW() WHERE program_id = :p::uuid AND week = 1 AND day > :n AND deleted_at IS NULL",
                Map.of("p", programId.toString(), "n", p.days().size()));
    }

    private void writeExercises(UUID workoutId, SeedDay day, Map<String, Lib> library) {
        var sets = new ArrayList<SqlParameterSource>();
        int position = 0;
        for (SeedExercise e : day.exercises()) {
            Lib lib = library.get(e.ex());
            UUID rowId = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO workout_exercise (id, workout_id, exercise_id, position, section)
                    VALUES (:id::uuid, :w::uuid, :ex::uuid, :pos, :section)
                    """, new MapSqlParameterSource("id", rowId.toString()).addValue("w", workoutId.toString())
                    .addValue("ex", lib.id().toString()).addValue("pos", position++).addValue("section", e.section()));
            var kinds = LogTypes.kindsOf(lib.logType());
            for (int s = 1; s <= e.sets(); s++) {
                sets.add(new MapSqlParameterSource("we", rowId.toString()).addValue("pos", s)
                        .addValue("lk", kinds.loadKind()).addValue("ek", kinds.effortKind())
                        .addValue("val", e.value()).addValue("rest", e.rest()));
            }
        }
        // The load is left null on purpose: it is the coach's to set, per client.
        jdbc.batchUpdate("""
                INSERT INTO workout_set (workout_exercise_id, position, load_kind, effort_kind, effort_value, rest_seconds)
                VALUES (:we::uuid, :pos, :lk, :ek, :val, :rest)
                """, sets.toArray(new SqlParameterSource[0]));
    }

    /** Anything on the shelf that the file no longer lists is retired, not deleted. */
    private int retire(List<UUID> keep) {
        return jdbc.update("""
                UPDATE program SET deleted_at = NOW()
                WHERE origin = 'inclineyou' AND deleted_at IS NULL AND id::text NOT IN (:ids)
                """, new MapSqlParameterSource("ids", keep.stream().map(UUID::toString).toList()));
    }

    static UUID programId(String slug) {
        return UUID.nameUUIDFromBytes((ID_NAMESPACE + slug).getBytes(StandardCharsets.UTF_8));
    }

    static UUID workoutId(String slug, int day) {
        return UUID.nameUUIDFromBytes((ID_NAMESPACE + slug + ":w1:d" + day).getBytes(StandardCharsets.UTF_8));
    }
}
