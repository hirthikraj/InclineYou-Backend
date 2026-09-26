package com.inclineyou.inclineyou_backend.tenant;

import com.inclineyou.inclineyou_backend.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
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
 * The suite — and the application — connect as {@code inclineyou}, which OWNS these
 * tables, and a table owner bypasses its own policies. So a test written the
 * ordinary way would pass every assertion below while row-level security was
 * doing nothing at all, which is the worst kind of green.
 *
 * <p>Every assertion here therefore runs on a raw JDBC connection opened as
 * {@code inclineyou_app} — the non-owning runtime login V42 creates — with the six
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
    @DisplayName("V19–V20 · a client can ask whether a number is taken, and can only ever move its OWN number")
    void portalPhoneFunctions() throws SQLException {
        String meerasPhone = jdbc.queryForObject("SELECT phone FROM client WHERE id = :id::uuid",
                Map.of("id", meeraPrivate.toString()), String.class);
        String priyasPhone = phoneOf(trainerPriya);
        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.phone", meerasPhone);
            set(c, "app.tenant_ids", TenantContext.array(List.of(tenantA, tenantB)));
            set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
            // The lens cannot see Priya's trainer row; the function answers anyway, yes or no.
            assertThat(strings(c, "SELECT portal_phone_in_use('" + priyasPhone + "')::text")).containsExactly("true");
            assertThatThrownBy(() -> exec(c, "SELECT portal_change_client_phone('" + priyasPhone + "', '6000000001')"))
                    .isInstanceOf(SQLException.class);
        }
    }

    @Test
    @DisplayName("V18 · client_prefs is the client's alone — its own trainer reads nothing; the bell is minted only by the gate")
    void clientPrefsAreTheClientsAlone() throws SQLException {
        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.tenant_ids", TenantContext.array(List.of(tenantA, tenantB)));
            set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
            exec(c, "INSERT INTO client_prefs (client_id, notify_session_reminder, nominee_name, nominee_phone, tenant_id) "
                    + "VALUES ('" + meeraPrivate + "', false, 'Ravi', '9845012345', '" + tenantA + "')");
            assertThat(count(c, "SELECT count(*) FROM client_prefs")).isOne();
            assertThatThrownBy(() -> exec(c, "INSERT INTO client_notification (client_id, kind, tenant_id) VALUES ('"
                    + meeraPrivate + "', 'note', '" + tenantA + "')")).isInstanceOf(SQLException.class);
        }
        try (Connection c = asAppRole()) {
            // Her own trainer, standing in her own workspace: nothing.
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM client_prefs WHERE client_id = '" + meeraPrivate + "'")).isZero();
            assertThat(count(c, "SELECT count(*) FROM client_notification WHERE client_id = '" + meeraPrivate + "'")).isZero();
            // …and yet the gate, run from a trainer request, reads the switch she set.
            assertThat(strings(c, "SELECT mint_client_notification('" + meeraPrivate + "', 'session', NULL, now(), 'booked')::text"))
                    .containsExactly((String) null);
            assertThat(strings(c, "SELECT mint_client_notification('" + meeraPrivate + "', 'pack', 100, NULL, 'sold') IS NOT NULL"))
                    .containsExactly("t");
        }
    }

    @Test
    @DisplayName("11c · a client answers its own assessment, cannot touch another's, and can ring its trainer's bell")
    void portalClientAnswers() throws SQLException {
        UUID mine = UUID.randomUUID();
        UUID theirs = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, tenant_id, name, due_at, sent_at)
                VALUES (:m::uuid, :c::uuid, :t::uuid, :tid::uuid, 'mine', now(), now()),
                       (:o::uuid, :s::uuid, :a::uuid, :tb::uuid, 'theirs', now(), now())
                """, Map.of("m", mine.toString(), "c", meeraPrivate.toString(), "t", trainerPriya.toString(),
                            "tid", tenantA.toString(), "o", theirs.toString(), "s", sanjay.toString(),
                            "a", trainerArun.toString(), "tb", tenantB.toString()));
        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.tenant_ids", TenantContext.array(List.of(tenantA, tenantB)));
            set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
            assertThat(c.createStatement().executeUpdate(
                    "UPDATE assessment SET answers = '[{\"questionId\":\"q\"}]' WHERE id = '" + mine + "'")).isOne();
            assertThat(c.createStatement().executeUpdate(
                    "UPDATE assessment SET answers = '[]' WHERE id = '" + theirs + "'")).isZero();
            exec(c, "SELECT mint_trainer_notification('" + trainerPriya + "', 'metric', '" + meeraPrivate + "', NULL, NULL, 'from portal')");
        }
        assertThat(jdbc.queryForObject(
                "SELECT tenant_id::text FROM trainer_notification WHERE text = 'from portal' AND trainer_id = :t::uuid",
                Map.of("t", trainerPriya.toString()), String.class)).isEqualTo(tenantA.toString());
    }

    @Test
    @DisplayName("V17 · a client writes its own log, feedback and milestone; never another's; staff read feedback and never write it")
    void portalClientWrites() throws SQLException {
        UUID workout = UUID.randomUUID();
        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.tenant_ids", TenantContext.array(List.of(tenantA, tenantB)));
            set(c, "app.tenant_id", tenantB.toString());           // standing in the OTHER roster's workspace
            set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
            exec(c, """
                    INSERT INTO workout_session (id, trainer_id, client_id, session_date, logged_by, tenant_id)
                    VALUES ('%s', '%s', '%s', CURRENT_DATE, 'client', '%s')
                    """.formatted(workout, trainerPriya, meeraPrivate, tenantA));
            exec(c, """
                    INSERT INTO workout_feedback (workout_session_id, client_id, effort, tenant_id)
                    VALUES ('%s', '%s', 'hard', '%s')
                    """.formatted(workout, meeraPrivate, tenantA));
            exec(c, """
                    INSERT INTO milestone (client_id, kind, label, value, tenant_id)
                    VALUES ('%s', 'sessions', 'x', 999999, '%s')
                    """.formatted(meeraPrivate, tenantA));
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO milestone (client_id, kind, label, value, tenant_id)
                    VALUES ('%s', 'sessions', 'forged', 1, '%s')
                    """.formatted(sanjay, tenantB))).isInstanceOf(SQLException.class);
        }
        // The explicit tenant held: the row is in Meera's private book, not the workspace the request stood in.
        assertThat(jdbc.queryForObject("SELECT tenant_id::text FROM workout_session WHERE id = :id::uuid",
                Map.of("id", workout.toString()), String.class)).isEqualTo(tenantA.toString());
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM workout_feedback WHERE workout_session_id = '" + workout + "'")).isOne();
            assertThat(c.createStatement().executeUpdate(
                    "UPDATE workout_feedback SET effort = 'easy' WHERE workout_session_id = '" + workout + "'")).isZero();
        }
    }

    @Test
    @DisplayName("V16 · the portal's client lens: shared notes, its own pack, a SENT assessment's template, its own messages")
    void portalClientLens() throws SQLException {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        // Notes about Meera (private practice): one shared, one private; one about Sanjay, shared.
        note(meeraPrivate, trainerPriya, "shared " + tag, true);
        note(meeraPrivate, trainerPriya, "private " + tag, false);
        note(sanjay, trainerArun, "sanjay " + tag, true);
        // A pack Meera bought from, and one nobody sold her.
        UUID bought = pack(trainerPriya, tenantA, "bought " + tag);
        pack(trainerPriya, tenantA, "unsold " + tag);
        jdbc.update("""
                INSERT INTO package (trainer_id, client_id, pack_id, tenant_id, type, amount, status)
                VALUES (:t::uuid, :c::uuid, :p::uuid, :tid::uuid, 'session_pack', 1000, 'active')
                """, Map.of("t", trainerPriya.toString(), "c", meeraPrivate.toString(), "p", bought.toString(),
                            "tid", tenantA.toString()));
        // Two templates: one sent to her, one only BOOKED for her.
        UUID sent = template(trainerPriya, tenantA, "sent " + tag);
        UUID booked = template(trainerPriya, tenantA, "booked " + tag);
        assessmentFor(meeraPrivate, trainerPriya, tenantA, sent, true);
        assessmentFor(meeraPrivate, trainerPriya, tenantA, booked, false);
        jdbc.update("""
                INSERT INTO client_message (client_id, trainer_id, tenant_id, body)
                VALUES (:c::uuid, :t::uuid, :tid::uuid, :b), (:s::uuid, :a::uuid, :tb::uuid, :b2)
                """, Map.of("c", meeraPrivate.toString(), "t", trainerPriya.toString(), "tid", tenantA.toString(),
                            "b", "for meera " + tag, "s", sanjay.toString(), "a", trainerArun.toString(),
                            "tb", tenantB.toString(), "b2", "for sanjay " + tag));

        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.tenant_ids", TenantContext.array(List.of(tenantA, tenantB)));
            set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
            assertThat(strings(c, "SELECT body FROM client_note WHERE body LIKE '%" + tag + "'"))
                    .containsExactly("shared " + tag);
            assertThat(strings(c, "SELECT name FROM pack WHERE name LIKE '%" + tag + "'"))
                    .containsExactly("bought " + tag);
            assertThat(strings(c, "SELECT name FROM assessment_template WHERE name LIKE '%" + tag + "'"))
                    .containsExactly("sent " + tag);
            assertThat(strings(c, "SELECT body FROM client_message WHERE body LIKE '%" + tag + "'"))
                    .containsExactly("for meera " + tag);
            // Read, never write: a client cannot post a message to themselves.
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO client_message (client_id, trainer_id, tenant_id, body)
                    VALUES ('%s', '%s', '%s', 'forged')
                    """.formatted(meeraPrivate, trainerPriya, tenantA))).isInstanceOf(SQLException.class);
        }
    }

    private void note(UUID clientId, UUID trainerId, String body, boolean shared) {
        jdbc.update("""
                INSERT INTO client_note (client_id, trainer_id, body, shared_with_client)
                VALUES (:c::uuid, :t::uuid, :b, :s)
                """, Map.of("c", clientId.toString(), "t", trainerId.toString(), "b", body, "s", shared));
    }

    private UUID pack(UUID trainerId, UUID tenantId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, tenant_id, name, amount) VALUES (:id::uuid, :t::uuid, :tid::uuid, :n, 1000)
                """, Map.of("id", id.toString(), "t", trainerId.toString(), "tid", tenantId.toString(), "n", name));
        return id;
    }

    private UUID template(UUID trainerId, UUID tenantId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment_template (id, trainer_id, tenant_id, name) VALUES (:id::uuid, :t::uuid, :tid::uuid, :n)
                """, Map.of("id", id.toString(), "t", trainerId.toString(), "tid", tenantId.toString(), "n", name));
        return id;
    }

    private void assessmentFor(UUID clientId, UUID trainerId, UUID tenantId, UUID templateId, boolean sent) {
        jdbc.update("""
                INSERT INTO assessment (client_id, trainer_id, tenant_id, template_id, name, due_at, sent_at)
                VALUES (:c::uuid, :t::uuid, :tid::uuid, :tpl::uuid, 'x', now(), %s)
                """.formatted(sent ? "now()" : "NULL"), Map.of("c", clientId.toString(), "t", trainerId.toString(),
                "tid", tenantId.toString(), "tpl", templateId.toString()));
    }

    @Test
    @DisplayName("V15 · the bell is read through the policy and written only through the mint function")
    void bellIsMintOnly() throws SQLException {
        UUID clientA = insertClient(tenantA, trainerPriya, "Bela", null);
        jdbc.queryForObject("""
                SELECT mint_trainer_notification(:t::uuid, 'metric', :c::uuid, NULL, NULL, '74 kg')::text
                """, Map.of("t", trainerPriya.toString(), "c", clientA.toString()), String.class);

        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM trainer_notification WHERE text = '74 kg'")).isOne();
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO trainer_notification (trainer_id, kind, tenant_id)
                    VALUES ('%s', 'metric', '%s')
                    """.formatted(trainerPriya, tenantA))).isInstanceOf(SQLException.class);
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM trainer_notification WHERE text = '74 kg'")).isZero();
        }
    }

    @Test
    @DisplayName("V14 · an assessment template and a sent assessment are their workspace's")
    void assessmentIsTierOne() throws SQLException {
        UUID clientA = insertClient(tenantA, trainerPriya, "Asha", null);
        UUID tpl = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment_template (id, trainer_id, tenant_id, name)
                VALUES (:id::uuid, :t::uuid, :tid::uuid, 'Priya monthly')
                """, Map.of("id", tpl.toString(), "t", trainerPriya.toString(), "tid", tenantA.toString()));
        jdbc.update("""
                INSERT INTO assessment (client_id, trainer_id, tenant_id, template_id, name, due_at)
                VALUES (:c::uuid, :t::uuid, :tid::uuid, :tpl::uuid, 'Priya monthly', now())
                """, Map.of("c", clientA.toString(), "t", trainerPriya.toString(), "tid", tenantA.toString(),
                            "tpl", tpl.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM assessment_template WHERE name = 'Priya monthly'")).isZero();
            assertThat(count(c, "SELECT count(*) FROM assessment WHERE name = 'Priya monthly'")).isZero();
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM assessment WHERE name = 'Priya monthly'")).isOne();
        }
    }

    @Test
    @DisplayName("V13 · a saved workout is its workspace's: invisible from another, and cannot be written into one")
    void workoutTemplateIsTierOne() throws SQLException {
        jdbc.update("""
                INSERT INTO workout_template (trainer_id, tenant_id, name)
                VALUES (:t::uuid, :tid::uuid, 'Priya upper A')
                """, Map.of("t", trainerPriya.toString(), "tid", tenantA.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM workout_template WHERE name = 'Priya upper A'")).isZero();
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO workout_template (trainer_id, tenant_id, name)
                    VALUES ('%s', '%s', 'Planted')
                    """.formatted(trainerArun, tenantA))).isInstanceOf(SQLException.class);
        }
    }

    @Test
    @DisplayName("V11 · certified programs are readable from any workspace and writable from none")
    void certifiedIsReadOnlyCatalogue() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM certified_template")).isGreaterThanOrEqualTo(2);
            // No UPDATE policy: the row is invisible to the UPDATE, so nothing changes.
            assertThat(c.createStatement().executeUpdate(
                    "UPDATE certified_template SET used_count = 999")).isZero();
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO certified_template (name, summary, level, equipment)
                    VALUES ('Injected', 'x', 'beginner', 'full-gym')
                    """)).isInstanceOf(SQLException.class);
        }
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
        // Found by pointing the runtime at inclineyou_app for the first time: the
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

    /* ------------------------------------------------ V21 · the schema review */

    @Test
    @DisplayName("V21 · no request writes the global library; only the system actor seeds it")
    void globalLibraryIsSeededNotWritten() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            inRolledBackTransaction(c, () -> {
                // The hole V21 closed: a NULL tenant used to satisfy the write check.
                assertThatThrownBy(() -> exec(c,
                        "INSERT INTO exercise (name, is_custom) VALUES ('Injected global', false)"))
                        .hasMessageContaining("row-level security");
            });
            inRolledBackTransaction(c, () -> {
                assertThat(update(c, "UPDATE exercise SET name = name WHERE NOT is_custom")).isZero();
                // Their own custom movement is still theirs to write.
                exec(c, "INSERT INTO exercise (name, is_custom, trainer_id) VALUES ('Priya V21', true, '"
                        + trainerPriya + "'::uuid)");
            });
        }
        try (Connection c = asAppRole()) {
            set(c, "app.actor", "client");
            set(c, "app.client_ids", "{" + meeraPrivate + "}");
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "INSERT INTO exercise (name, is_custom) VALUES ('Client global', false)"))
                    .hasMessageContaining("row-level security"));
        }
        try (Connection c = asAppRole()) {
            // What ExerciseSeeder declares at boot, and nothing else can.
            set(c, "app.actor", "system");
            inRolledBackTransaction(c, () -> exec(c,
                    "INSERT INTO exercise (name, is_custom) VALUES ('Seeded V21', false)"));
        }
    }

    @Test
    @DisplayName("V21 · the request role cannot hard-delete, nor rewrite an append-only log")
    void noHardDeleteAndLogsAreAppendOnly() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c, "DELETE FROM payment"))
                    .hasMessageContaining("permission denied"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "UPDATE package_adjustment SET reason = 'rewritten'"))
                    .hasMessageContaining("permission denied"));
        }
    }

    @Test
    @DisplayName("V21 · only its owner renames a workspace, and no request mints an owner")
    void workspaceRootIsOwnerOnly() throws SQLException {
        String priyaUser = jdbc.queryForObject(
                "SELECT id::text FROM app_user WHERE phone = :p", Map.of("p", phoneOf(trainerPriya)), String.class);
        try (Connection c = asAppRole()) {
            // Priya coaches at Iron House; Arun owns it.
            staff(c, tenantB, List.of(tenantB), trainerPriya);
            inRolledBackTransaction(c, () -> {
                assertThat(update(c, "UPDATE tenant SET name = 'Renamed' WHERE id = '" + tenantB + "'")).isZero();
                assertThatThrownBy(() -> exec(c, "INSERT INTO tenant_member (tenant_id, app_user_id, role) VALUES ('"
                        + tenantB + "'::uuid, '" + priyaUser + "'::uuid, 'owner')"))
                        .hasMessageContaining("row-level security");
            });
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "UPDATE tenant_member SET role = 'owner' WHERE tenant_id = '" + tenantB
                            + "' AND app_user_id = '" + priyaUser + "'"))
                    .hasMessageContaining("may not make a workspace member an owner"));
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            inRolledBackTransaction(c, () ->
                    assertThat(update(c, "UPDATE tenant SET name = 'Iron House Gym' WHERE id = '" + tenantB + "'")).isOne());
        }
    }

    @Test
    @DisplayName("V21 · the portal's number move refuses a request that has not proved the old number")
    void phoneMoveNeedsTheCallersOwnNumber() throws SQLException {
        String meera = jdbc.queryForObject("SELECT phone FROM client WHERE id = :id::uuid",
                Map.of("id", meeraPrivate.toString()), String.class);
        try (Connection c = asAppRole()) {
            // No context at all: V20 read this as "no phone, so no check".
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "SELECT portal_change_client_phone('" + meera + "', '9999900001')"))
                    .hasMessageContaining("own number"));
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "SELECT portal_change_client_phone('" + meera + "', '9999900001')"))
                    .hasMessageContaining("own number"));
        }
    }

    @Test
    @DisplayName("V21 · a notification cannot be minted into a bell with no claim on the client")
    void bellNeedsAClaimOnTheClient() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            inRolledBackTransaction(c, () -> {
                assertThat(strings(c, "SELECT mint_trainer_notification('" + trainerArun
                        + "'::uuid, 'metric', '" + meeraPrivate + "'::uuid, NULL, NULL, 'not yours')"))
                        .containsExactly((String) null);
                assertThat(strings(c, "SELECT mint_trainer_notification('" + trainerPriya
                        + "'::uuid, 'metric', '" + meeraPrivate + "'::uuid, NULL, NULL, 'yours')"))
                        .doesNotContainNull();
            });
        }
    }

    @Test
    @DisplayName("V21 · a child row cannot sit in a different workspace from its parent")
    void childFollowsParentWorkspace() {
        // Written as the owner, which bypasses every policy — so this is the
        // foreign key alone doing the refusing.
        assertThatThrownBy(() -> payment(tenantB, meeraPrivate, trainerPriya, 100))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("payment_client_same_tenant");
    }

    @Test
    @DisplayName("V21 · every trainer starts a trial, and no request can create or remove one")
    void everyTrainerHasATrialClock() throws SQLException {
        var row = jdbc.queryForMap("""
                SELECT state, plan, trial_ends_at - trial_started_at AS len
                FROM subscription WHERE trainer_id = :t::uuid
                """, Map.of("t", trainerPriya.toString()));
        assertThat(row.get("state")).isEqualTo("trialing");
        assertThat(row.get("plan")).isEqualTo("pro");
        assertThat(row.get("len").toString()).contains("30 days");

        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM subscription WHERE trainer_id = '" + trainerPriya + "'")).isOne();
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "DELETE FROM subscription WHERE trainer_id = '" + trainerPriya + "'"))
                    .hasMessageContaining("permission denied"));
        }
    }

    /* ----------------------------------------------------------- machinery */

    @FunctionalInterface
    private interface SqlBlock { void run() throws Exception; }

    /**
     * Runs a block and rolls it back, so a V21 probe that succeeds leaves no row
     * behind in the shared development database. The session settings are
     * written BEFORE this opens — set_config inside a rolled-back transaction
     * is rolled back with it.
     */
    private static void inRolledBackTransaction(Connection c, SqlBlock block) throws SQLException {
        c.setAutoCommit(false);
        try {
            block.run();
        } catch (SQLException | RuntimeException | Error e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            c.rollback();
            c.setAutoCommit(true);
        }
    }

    private static int update(Connection c, String sql) throws SQLException {
        try (Statement st = c.createStatement()) { return st.executeUpdate(sql); }
    }

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
