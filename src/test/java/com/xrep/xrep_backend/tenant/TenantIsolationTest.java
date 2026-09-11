package com.xrep.xrep_backend.tenant;

import com.xrep.xrep_backend.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proof that the walls are real, run against the role they apply to.
 *
 * <h2>Why this test opens its own connection</h2>
 *
 * The suite — and the application — connect as {@code xrep}, which OWNS these
 * tables, and a table owner bypasses its own policies. So a test written the
 * ordinary way would pass every assertion below while row-level security was
 * doing nothing at all, which is the worst kind of green.
 *
 * <p>Every assertion here therefore runs on a raw JDBC connection opened as
 * {@code xrep_app} — the non-owning runtime login V42 creates — with the six
 * session settings written by hand, exactly as {@code TenantAwareDataSource}
 * writes them on every borrow in production.
 *
 * <h2>What is being pinned</h2>
 *
 * Six properties, and each one is a way this design could silently stop working:
 * cross-tenant reads, fail-closed on an unset context, the combined-versus-money
 * split, the client lens across two rosters, the write check, and immutability.
 */
@SpringBootTest
@DisplayName("tenant isolation")
class TenantIsolationTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired AppProperties props;

    @Value("${spring.datasource.url}") String url;

    private UUID tenantA, tenantB;
    private UUID trainerPriya, trainerArun;
    private UUID meeraPrivate, meeraGym, sanjay;

    /**
     * Priya coaches privately and at Iron House. Meera trains with her in both,
     * which is two client rows. Arun coaches Sanjay at the gym only.
     *
     * <p>Written as the owner, deliberately: seeding is a migration-shaped act
     * and the policies must not apply to it, or no test could ever set up.
     */
    @BeforeEach
    void seed() {
        String suffix = String.valueOf(System.nanoTime() % 100000L);
        String phonePriya = "90000" + suffix;
        String phoneArun  = "91000" + suffix;
        String phoneMeera = "92000" + suffix;

        UUID userPriya = insertUser(phonePriya, "trainer");
        UUID userArun  = insertUser(phoneArun, "trainer");
        insertUser(phoneMeera, "client");

        // The trigger in V39 gives each trainer a solo workspace on insert, so
        // this is also a test that that trigger fires.
        trainerPriya = insertTrainer(phonePriya, "Priya");
        trainerArun  = insertTrainer(phoneArun, "Arun");
        tenantA = homeTenantOf(trainerPriya);

        tenantB = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO tenant (id, type, name, primary_app_user_id)
                VALUES (:id::uuid, 'gym', 'Iron House', :owner::uuid)
                """, Map.of("id", tenantB.toString(), "owner", userArun.toString()));
        member(tenantB, userPriya, "coach");
        member(tenantB, userArun, "owner");

        meeraPrivate = insertClient(tenantA, trainerPriya, "Meera private", phoneMeera);
        meeraGym     = insertClient(tenantB, trainerPriya, "Meera gym", phoneMeera);
        sanjay       = insertClient(tenantB, trainerArun, "Sanjay", null);

        payment(tenantA, meeraPrivate, trainerPriya, 3000);
        payment(tenantB, sanjay, trainerArun, 5000);
    }

    @Test
    @DisplayName("an unset context returns nothing, never everything")
    void failsClosed() throws SQLException {
        try (Connection c = asAppRole()) {
            // No settings written at all — the state a request that skipped the
            // filter would be in. This is the assertion most likely to break
            // silently, because a policy that fails OPEN looks like a working
            // application until the day somebody notices.
            assertThat(count(c, "SELECT count(*) FROM client")).isZero();
            assertThat(count(c, "SELECT count(*) FROM payment")).isZero();
            assertThat(count(c, "SELECT count(*) FROM set_log")).isZero();
        }
    }

    @Test
    @DisplayName("one workspace cannot see another's rows")
    void workspacesAreSeparate() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            List<String> names = strings(c, "SELECT name FROM client ORDER BY name");
            assertThat(names).containsExactly("Meera gym", "Sanjay");
            assertThat(names).doesNotContain("Meera private");
        }
    }

    @Test
    @DisplayName("a trainer in two workspaces sees one working day")
    void combinedReadSpansWorkspaces() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA, tenantB), trainerPriya);
            assertThat(strings(c, "SELECT name FROM client ORDER BY name"))
                    .contains("Meera private", "Meera gym");
        }
    }

    @Test
    @DisplayName("money is the workspace you are standing in, never the set")
    void moneyDoesNotWiden() throws SQLException {
        try (Connection c = asAppRole()) {
            // Priya is in both workspaces and reading in combined view. The
            // coaching tables widen; tier 2 does not, so she sees her own 3000
            // and nothing of Iron House's 5000.
            staff(c, tenantA, List.of(tenantA, tenantB), trainerPriya);
            assertThat(strings(c, "SELECT amount::text FROM payment"))
                    .containsExactly("3000.00");

            staff(c, tenantB, List.of(tenantA, tenantB), trainerPriya);
            assertThat(strings(c, "SELECT amount::text FROM payment"))
                    .containsExactly("5000.00");
        }
    }

    @Test
    @DisplayName("a client reads their own rows on both rosters and nobody else's")
    void clientLensIsPluralAndNarrow() throws SQLException {
        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
            List<String> names = strings(c, "SELECT name FROM client ORDER BY name");
            assertThat(names).containsExactly("Meera gym", "Meera private");
            // No tier 1 for a client: the roster of the workspace they train in
            // is not theirs to read, even though their own row is in it.
            assertThat(names).doesNotContain("Sanjay");
        }
    }

    @Test
    @DisplayName("a write cannot land in a workspace you are not standing in")
    void writeCheckHolds() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA, tenantB), trainerPriya);
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO client (tenant_id, trainer_id, name)
                    VALUES ('%s', '%s', 'Smuggled')
                    """.formatted(tenantB, trainerPriya)))
                    .hasMessageContaining("row-level security");
        }
    }

    @Test
    @DisplayName("a row cannot move between workspaces, even as the owner")
    void tenantIdIsImmutable() {
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE client SET tenant_id = :b::uuid WHERE id = :id::uuid",
                Map.of("b", tenantB.toString(), "id", meeraPrivate.toString())))
                .hasMessageContaining("immutable");
    }

    @Test
    @DisplayName("the shared catalogue is readable everywhere, a custom exercise is not")
    void catalogueIsSharedAndCustomIsNot() throws SQLException {
        jdbc.update("INSERT INTO exercise (name, is_custom) VALUES ('Barbell Squat " + tenantA + "', false)",
                Map.of());
        jdbc.update("""
                INSERT INTO exercise (name, is_custom, trainer_id, tenant_id)
                VALUES ('Priya special', true, :t::uuid, :tid::uuid)
                """, Map.of("t", trainerPriya.toString(), "tid", tenantA.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(strings(c, "SELECT name FROM exercise WHERE is_custom"))
                    .doesNotContain("Priya special");
            assertThat(count(c, "SELECT count(*) FROM exercise WHERE NOT is_custom"))
                    .isPositive();
        }
    }

    @Test
    @DisplayName("signing up creates a workspace the app role could not create itself")
    void signUpMintsAWorkspace() throws Exception {
        // Found by pointing the runtime at xrep_app for the first time: the
        // BEFORE INSERT trigger that gives every trainer a solo workspace was
        // writing to `tenant`, whose policy is keyed on a membership that this
        // very insert is what creates. Under the app role no trainer could be
        // created at all — sign-up, the first thing the product does.
        String phone = "93000" + System.nanoTime() % 100000L;
        UUID id = UUID.randomUUID();

        try (Connection c = asAppRole()) {
            set(c, "app.actor", "staff");
            set(c, "app.phone", phone);

            exec(c, "INSERT INTO app_user (phone, role) VALUES ('" + phone + "', 'trainer')");
            exec(c, "INSERT INTO trainer (id, phone, name) VALUES ('"
                    + id + "'::uuid, '" + phone + "', 'Nikhil')");

            // The workspace exists, and the trigger — not the caller — made it.
            assertThat(count(c, "SELECT count(*) FROM tenant_member WHERE app_user_id ="
                    + " (SELECT id FROM app_user WHERE phone = '" + phone + "')")).isEqualTo(1);

            // And the privilege stayed inside the trigger: the app role still
            // cannot write a workspace of its own choosing. If this ever passes,
            // SECURITY DEFINER has been turned into a hole rather than a door.
            assertThatThrownBy(() -> exec(c, "INSERT INTO tenant (type, name) VALUES ('gym', 'Fake')"))
                    .hasMessageContaining("row-level security");
        }

        assertThat(homeTenantOf(id)).isNotNull();
    }

    @Test
    @DisplayName("a trainer may open a team's workspace, but only their own")
    void teamCreationLandsInAWorkspaceThatIsNotTheActiveOne() throws Exception {
        // The other bug the switch found. Creating a team CREATES a workspace,
        // so the row lands in a tenant that is by definition not the one the
        // trainer is looking at and not yet in app.tenant_ids — which the plain
        // `tenant_id = app_tenant_id()` write check refused.
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            exec(c, "INSERT INTO team (id, owner_trainer_id, name) VALUES ("
                    + "gen_random_uuid(), '" + trainerPriya + "'::uuid, 'Iron House Crew')");

            // And it has to be readable in the same breath. Every create reads
            // the row back to return it, and app.tenant_ids was fixed when the
            // request began — so a write rule widened without the matching read
            // rule turns a refused insert into a 500 two lines later.
            assertThat(strings(c, "SELECT name FROM team")).contains("Iron House Crew");
        }

        // Arun owns neither Priya's solo workspace nor the team she just made,
        // so the widening is "a workspace you own", not "any workspace".
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThatThrownBy(() -> exec(c, "INSERT INTO team (id, owner_trainer_id, name, tenant_id)"
                    + " VALUES (gen_random_uuid(), '" + trainerArun + "'::uuid, 'Poach', '"
                    + tenantA + "'::uuid)"))
                    .hasMessageContaining("row-level security");
        }
    }

    @Test
    @DisplayName("the workspace membership completes whichever row lands second")
    void membershipSurvivesTheWriteOrder() {
        // Sign-up writes `trainer` and `app_user` in one transaction, and
        // Hibernate flushes the trainer first — so the trigger that looks the
        // account up by phone found nothing and no membership was written. The
        // trainer got a home workspace they were not a member of, which is a
        // workspace switcher that is empty for every trainer who ever signs up.
        // Seeded here in the order the real path uses, which is the reverse of
        // the order every other test in this class uses.
        String phone = "94000" + System.nanoTime() % 100000L;
        UUID id = insertTrainer(phone, "Ordered last");
        insertUser(phone, "trainer");

        Long members = jdbc.queryForObject("""
                SELECT count(*) FROM tenant_member m
                JOIN app_user au ON au.id = m.app_user_id
                WHERE au.phone = :p AND m.tenant_id = (
                    SELECT home_tenant_id FROM trainer WHERE id = :t::uuid)
                """, Map.of("p", phone, "t", id.toString()), Long.class);
        assertThat(members).isEqualTo(1);
    }

    /* ----------------------------------------------------------- machinery */

    /**
     * A connection as the role the policies apply to. Not the pooled one — that
     * belongs to the owner, and the owner is exactly who must not be tested.
     */
    private Connection asAppRole() throws SQLException {
        return DriverManager.getConnection(url,
                props.getDatabase().getAppRole(),
                props.getDatabase().getAppRolePassword());
    }

    /** The same six settings {@code TenantAwareDataSource} writes on every borrow. */
    private void staff(Connection c, UUID active, List<UUID> readable, UUID trainerId)
            throws SQLException {
        set(c, "app.actor", "staff");
        // app.phone was missing here while this helper claimed to write the same
        // six settings as TenantAwareDataSource. It went unnoticed because
        // nothing read it until app_owns_tenant() did — a helper that mirrors
        // the runtime has to mirror all of it, or it tests a session shape that
        // never occurs.
        set(c, "app.phone", phoneOf(trainerId));
        set(c, "app.tenant_id", active.toString());
        set(c, "app.tenant_ids", TenantContext.array(readable));
        set(c, "app.trainer_id", trainerId.toString());
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

    private static long count(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static List<String> strings(Connection c, String sql) throws SQLException {
        var out = new ArrayList<String>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) out.add(rs.getString(1));
        }
        return out;
    }

    private UUID insertUser(String phone, String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (:id::uuid, :p, :r)",
                Map.of("id", id.toString(), "p", phone, "r", role));
        return id;
    }

    private UUID insertTrainer(String phone, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :p, :n)",
                Map.of("id", id.toString(), "p", phone, "n", name));
        return id;
    }

    /** Read as the owner: the harness is allowed to know things the role cannot. */
    private String phoneOf(UUID trainerId) {
        return jdbc.queryForObject("SELECT phone FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainerId.toString()), String.class);
    }

    private UUID homeTenantOf(UUID trainerId) {
        return UUID.fromString((String) jdbc.queryForList(
                "SELECT home_tenant_id::text AS id FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainerId.toString())).getFirst().get("id"));
    }

    private void member(UUID tenantId, UUID appUserId, String role) {
        jdbc.update("""
                INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home)
                VALUES (:t::uuid, :u::uuid, :r, 'active', FALSE)
                ON CONFLICT DO NOTHING
                """, Map.of("t", tenantId.toString(), "u", appUserId.toString(), "r", role));
    }

    private UUID insertClient(UUID tenantId, UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new java.util.HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tenantId.toString());
        p.put("tr", trainerId.toString());
        p.put("n", name);
        p.put("ph", phone);
        jdbc.update("""
                INSERT INTO client (id, tenant_id, trainer_id, name, phone)
                VALUES (:id::uuid, :tid::uuid, :tr::uuid, :n, :ph)
                """, p);
        return id;
    }

    private void payment(UUID tenantId, UUID clientId, UUID trainerId, int amount) {
        jdbc.update("""
                INSERT INTO payment (tenant_id, client_id, trainer_id, amount, status, paid_at)
                VALUES (:tid::uuid, :c::uuid, :tr::uuid, :a, 'paid', NOW())
                """, Map.of("tid", tenantId.toString(), "c", clientId.toString(),
                            "tr", trainerId.toString(), "a", amount));
    }
}
