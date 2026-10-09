package com.inclineyou.inclineyou_backend.infrastructure.seed;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The InclineYou starter programs: what ends up on the shelf, that a second run changes nothing, and that a changed
 * program is rewritten in place — same ids, a moved {@code revised_at}, the shelf's {@code used_count} untouched.
 *
 * <p>Deliberately NOT {@code @Transactional}: the seeder writes in its own transactions, as the SYSTEM actor, so it has
 * to be looked at from outside them. It writes exactly what application start writes, so the test database is left in
 * the state it would be in anyway; the one thing a test changes ({@code used_count}) is put back.
 */
@SpringBootTest
class CertifiedSeederTest {

    @Autowired CertifiedSeeder seeder;
    @Autowired NamedParameterJdbcTemplate jdbc;

    private static final String SLUG = "strength-base";

    private UUID shelfId(String slug) {
        return CertifiedSeeder.programId(slug);
    }

    private Timestamp revisedAt(UUID id) {
        return jdbc.queryForObject("SELECT revised_at FROM program WHERE id = :id::uuid", Map.of("id", id.toString()), Timestamp.class);
    }

    @Test
    @DisplayName("the shelf holds twelve samples, each with a workout per day and sets in the kind its movement's log type gives")
    void theShelf() throws Exception {
        seeder.run(null);
        Integer programs = jdbc.queryForObject("""
                SELECT count(*) FROM program p JOIN certified_program cp ON cp.program_id = p.id
                WHERE p.origin = 'inclineyou' AND p.deleted_at IS NULL AND cp.is_sample AND cp.reviewed_at IS NULL
                """, Map.of(), Integer.class);
        assertThat(programs).isEqualTo(12);

        // One live week-1 workout per training day, each with movements, each movement with sets.
        List<Map<String, Object>> broken = jdbc.queryForList("""
                SELECT p.name FROM program p JOIN certified_program cp ON cp.program_id = p.id
                WHERE p.origin = 'inclineyou' AND p.deleted_at IS NULL AND (
                    (SELECT count(*) FROM workout w WHERE w.program_id = p.id AND w.deleted_at IS NULL) <> p.days
                 OR EXISTS (SELECT 1 FROM workout w WHERE w.program_id = p.id AND w.deleted_at IS NULL AND NOT EXISTS
                            (SELECT 1 FROM workout_exercise we WHERE we.workout_id = w.id))
                 OR EXISTS (SELECT 1 FROM workout_exercise we JOIN workout w ON w.id = we.workout_id
                            WHERE w.program_id = p.id AND NOT EXISTS (SELECT 1 FROM workout_set s WHERE s.workout_exercise_id = we.id)))
                """, Map.of());
        assertThat(broken).as("programs with a missing workout, movement or sets").isEmpty();

        // The kinds follow the library: a plank is seconds, a farmer's walk is metres, and the load is never invented.
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM workout_set s JOIN workout_exercise we ON we.id = s.workout_exercise_id
                JOIN exercise e ON e.id = we.exercise_id JOIN workout w ON w.id = we.workout_id
                WHERE w.origin = 'inclineyou' AND ((e.log_type = 'time' AND s.effort_kind <> 'time')
                   OR (e.log_type = 'weight_distance' AND (s.effort_kind <> 'distance' OR s.load_kind <> 'weight'))
                   OR (e.log_type = 'reps' AND s.load_kind <> 'bodyweight') OR s.load_value IS NOT NULL)
                """, Map.of(), Integer.class)).isZero();
    }

    @Test
    @DisplayName("a second run changes nothing: not revised_at, not used_count")
    void idempotent() throws Exception {
        seeder.run(null);
        UUID id = shelfId(SLUG);
        Timestamp before = revisedAt(id);
        Integer used = jdbc.queryForObject("SELECT used_count FROM certified_program WHERE program_id = :id::uuid", Map.of("id", id.toString()), Integer.class);
        try {
            jdbc.update("UPDATE certified_program SET used_count = 5 WHERE program_id = :id::uuid", Map.of("id", id.toString()));
            seeder.run(null);
            assertThat(revisedAt(id)).isEqualTo(before);
            assertThat(jdbc.queryForObject("SELECT used_count FROM certified_program WHERE program_id = :id::uuid", Map.of("id", id.toString()), Integer.class)).isEqualTo(5);
        } finally {
            jdbc.update("UPDATE certified_program SET used_count = :n WHERE program_id = :id::uuid", Map.of("id", id.toString(), "n", used));
        }
    }

    @Test
    @DisplayName("a changed program is rewritten in place: workouts keep their ids, revised_at moves, used_count stays")
    void changedIsRewrittenInPlace() throws Exception {
        seeder.run(null);
        UUID id = shelfId(SLUG);
        List<UUID> workouts = jdbc.query("SELECT id FROM workout WHERE program_id = :id::uuid AND deleted_at IS NULL ORDER BY day",
                Map.of("id", id.toString()), (rs, i) -> UUID.fromString(rs.getString(1)));
        Timestamp before = revisedAt(id);
        Integer used = jdbc.queryForObject("SELECT used_count FROM certified_program WHERE program_id = :id::uuid", Map.of("id", id.toString()), Integer.class);
        try {
            jdbc.update("UPDATE certified_program SET content_hash = 'stale', used_count = 9 WHERE program_id = :id::uuid", Map.of("id", id.toString()));
            Thread.sleep(5);   // so a moved revised_at is distinguishable
            seeder.run(null);

            assertThat(revisedAt(id)).isAfter(before);
            assertThat(jdbc.queryForObject("SELECT used_count FROM certified_program WHERE program_id = :id::uuid", Map.of("id", id.toString()), Integer.class)).isEqualTo(9);
            assertThat(jdbc.query("SELECT id FROM workout WHERE program_id = :id::uuid AND deleted_at IS NULL ORDER BY day",
                    Map.of("id", id.toString()), (rs, i) -> UUID.fromString(rs.getString(1)))).isEqualTo(workouts);
            assertThat(jdbc.queryForObject("SELECT content_hash FROM certified_program WHERE program_id = :id::uuid", Map.of("id", id.toString()), String.class)).isNotEqualTo("stale");
        } finally {
            jdbc.update("UPDATE certified_program SET used_count = :n WHERE program_id = :id::uuid", Map.of("id", id.toString(), "n", used));
        }
    }
}
