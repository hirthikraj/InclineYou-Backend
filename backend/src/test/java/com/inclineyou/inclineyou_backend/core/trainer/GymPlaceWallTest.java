package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * V8 · the walls around {@code gym_place}, asserted as {@code inclineyou_app}. Not
 * {@code @Transactional}: a second login only sees committed rows, so fixtures are
 * written as the owner, left committed, and swept in {@code @AfterEach}.
 *
 * <p>(Kept out of {@code TenantIsolationTest}, which is currently red for an unrelated
 * reason — its seeded phones fail {@code app_user_phone_format}.)
 */
@SpringBootTest
@DisplayName("gym directory walls")
class GymPlaceWallTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired AppProperties props;
    @Value("${spring.datasource.url}") String url;

    private static final String PLACE = "ChIJ-wall-test";
    private UUID a, b;

    @BeforeEach
    void seed() {
        String n = String.format("%08d", System.nanoTime() % 100_000_000L);   // +91 then 10 digits starting 6-9
        a = trainer("+9197" + n);
        b = trainer("+9196" + n);
    }

    @AfterEach
    void sweep() {
        jdbc.update("UPDATE trainer_business SET gym_place_id = NULL WHERE trainer_id IN (:a, :b)", Map.of("a", a, "b", b));
        jdbc.update("DELETE FROM gym_place WHERE place_id LIKE 'ChIJ-wall-%'", Map.of());
    }

    @Test
    @DisplayName("a trainer reads only their own place; cannot enumerate, write or read the stats; two picks share one row")
    void walls() throws Exception {
        UUID placeA;
        try (Connection c = asApp()) {
            label(c, a);
            placeA = UUID.fromString(scalar(c, "SELECT upsert_gym_place('" + PLACE + "', 'Wall Gym', NULL, 'Pune', NULL, NULL, NULL)::text"));
            exec(c, "UPDATE trainer_business SET gym_place_id = '" + placeA + "' WHERE trainer_id = '" + a + "'");
            assertEquals("1", scalar(c, "SELECT count(*) FROM gym_place"));
        }
        try (Connection c = asApp()) {
            label(c, b);
            // B has picked nothing: the directory is empty to them, even though a row exists.
            assertEquals("0", scalar(c, "SELECT count(*) FROM gym_place"));
            // Picking the same place returns the same row, and then they can read it.
            UUID placeB = UUID.fromString(scalar(c, "SELECT upsert_gym_place('" + PLACE + "', 'Other Name', NULL, NULL, NULL, NULL, NULL)::text"));
            assertEquals(placeA, placeB);
            exec(c, "UPDATE trainer_business SET gym_place_id = '" + placeB + "' WHERE trainer_id = '" + b + "'");
            assertEquals("Wall Gym", scalar(c, "SELECT name FROM gym_place"));   // first writer's name stands

            assertRefused(c, "INSERT INTO gym_place (place_id, name) VALUES ('ChIJ-wall-direct', 'x')");
            assertRefused(c, "UPDATE gym_place SET name = 'hijacked'");
            assertRefused(c, "DELETE FROM gym_place");
            assertRefused(c, "SELECT * FROM gym_place_stats");
        }
        try (Connection c = asApp()) {
            // No trainer label (nobody signed in): the door is shut.
            assertRefused(c, "SELECT upsert_gym_place('ChIJ-wall-anon', 'x', NULL, NULL, NULL, NULL, NULL)");
        }
        // The owner counts both, and the stats name nobody.
        assertEquals(2L, jdbc.queryForObject("SELECT trainers FROM gym_place_stats WHERE place_id = :p", Map.of("p", PLACE), Long.class));
    }

    /** Refused, and the connection stays usable: each probe is its own rolled-back transaction. */
    private static void assertRefused(Connection c, String sql) throws SQLException {
        c.setAutoCommit(false);
        try {
            try (Statement st = c.createStatement()) { st.execute(sql); }
            c.rollback();
            fail("expected the database to refuse: " + sql);
        } catch (SQLException expected) {
            c.rollback();
        } finally {
            c.setAutoCommit(true);
        }
    }

    private Connection asApp() throws SQLException {
        return DriverManager.getConnection(url, props.getDatabase().getAppRole(), props.getDatabase().getAppRolePassword());
    }

    private static void label(Connection c, UUID trainerId) throws SQLException {
        set(c, "app.actor", "staff");
        set(c, "app.trainer_id", trainerId.toString());
        set(c, "app.tenant_ids", "{}");
        set(c, "app.phone", "");
        set(c, "app.client_ids", "");
    }

    private static void set(Connection c, String key, String value) throws SQLException {
        try (var ps = c.prepareStatement("SELECT set_config(?, ?, false)")) {
            ps.setString(1, key);
            ps.setString(2, value);
            ps.execute();
        }
    }

    private static void exec(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement()) { st.execute(sql); }
    }

    private static String scalar(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); var rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getString(1);
        }
    }

    private UUID trainer(String phone) {
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING", Map.of("p", phone));
        String appUser = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, 'Wall') ON CONFLICT (app_user_id) DO NOTHING", Map.of("a", appUser));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid", Map.of("a", appUser), String.class));
    }
}
