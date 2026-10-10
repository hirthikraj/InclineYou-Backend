package com.inclineyou.inclineyou_backend.core.tenant;

import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import org.junit.jupiter.api.AfterEach;
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
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

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
 * {@code inclineyou_app} — the non-owning runtime login — with the six
 * session settings written by hand, exactly as {@code TenantAwareDataSource}
 * writes them on every borrow in production.
 *
 * <h2>What is being pinned</h2>
 *
 * Cross-tenant reads, fail-closed on an unset context, the combined-versus-money
 * split, the write check, immutability, the catalogue tiers, and — since V11
 * added the client lens (tier 4) — that a {@code client} actor reads exactly its
 * own rows and writes only what the column guards allow.
 *
 * <h2>The shared development database</h2>
 *
 * This class COMMITS (it cannot be {@code @Transactional}: the app-role
 * connections are separate sessions), against the developer's real database. So
 * every fixture uses random phones, nothing pre-existing is read or changed, and
 * {@link #cleanUp()} deletes everything the test created — as the owner, in
 * foreign-key order — whether the test passed, failed or died in the seed.
 */
@SpringBootTest
@DisplayName("tenant isolation")
class TenantIsolationTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired AppProperties props;

    @Value("${spring.datasource.url}") String url;

    private UUID tenantA, tenantB;
    private UUID userPriya, userArun;
    private UUID trainerPriya, trainerArun;
    private UUID meeraPrivate, meeraGym, sanjay;
    private UUID packageMeera, packageSanjay;
    private String phoneMeera;

    // The portal fixtures (portalFixtures()): built only by the tests that need them, so the other tests stay as light as they were.
    private UUID sessionLed, sessionSelf, sessionSanjay, setLed, setSelf, setSanjay;
    private UUID assessmentSent, assessmentUnsent, notificationMeera;

    /** Everything the test minted, so cleanUp() can find it however far the seed got. */
    private final List<String> phones = new ArrayList<>();
    private final String tag = Long.toString(ThreadLocalRandom.current().nextLong(1_000_000_000L), 36);

    /**
     * Priya coaches privately and at Iron House. Meera trains with her in both,
     * which is two client rows. Arun owns Iron House and coaches Sanjay there.
     *
     * <p>Written as the owner, deliberately: seeding is a migration-shaped act
     * and the policies must not apply to it, or no test could ever set up.
     */
    @BeforeEach
    void seed() {
        String phonePriya = newPhone();
        String phoneArun = newPhone();
        phoneMeera = newPhone();

        userPriya = insertUser(phonePriya, "trainer");
        userArun = insertUser(phoneArun, "trainer");

        // The BEFORE INSERT trigger on trainer gives each trainer a solo
        // workspace and the AFTER INSERT one makes them its owner, so this is
        // also a test that those triggers fire.
        trainerPriya = insertTrainer(userPriya, "Priya " + tag);
        trainerArun = insertTrainer(userArun, "Arun " + tag);
        tenantA = homeTenantOf(trainerPriya);

        tenantB = UUID.randomUUID();
        jdbc.update("INSERT INTO tenant (id, type, name) VALUES (:id::uuid, 'gym', :n)",
                Map.of("id", tenantB.toString(), "n", "Iron House " + tag));
        member(tenantB, userArun, "owner");
        member(tenantB, userPriya, "coach");

        meeraPrivate = insertClient(tenantA, trainerPriya, "Meera private", phoneMeera);
        meeraGym = insertClient(tenantB, trainerPriya, "Meera gym", phoneMeera);
        sanjay = insertClient(tenantB, trainerArun, "Sanjay", null);

        packageMeera = pack(tenantA, meeraPrivate, trainerPriya, 6000);
        packageSanjay = pack(tenantB, sanjay, trainerArun, 8000);
        payment(tenantA, meeraPrivate, trainerPriya, packageMeera, 3000);
        payment(tenantB, sanjay, trainerArun, packageSanjay, 5000);
    }

    /**
     * Removes every row the test created, as the owner (which bypasses the
     * policies). The shared dev database must be exactly as it was found.
     */
    @AfterEach
    void cleanUp() {
        if (phones.isEmpty()) return;
        List<UUID> users = uuids("SELECT id FROM app_user WHERE phone IN (:p)", Map.of("p", phones));
        if (users.isEmpty()) return;
        List<UUID> trainers = uuids("SELECT id FROM trainer WHERE app_user_id IN (:u)", Map.of("u", users));

        Set<UUID> tenants = new LinkedHashSet<>();
        if (tenantB != null) tenants.add(tenantB);
        tenants.addAll(uuids("SELECT home_tenant_id FROM trainer WHERE app_user_id IN (:u) AND home_tenant_id IS NOT NULL",
                Map.of("u", users)));
        tenants.addAll(uuids("SELECT tenant_id FROM tenant_member WHERE app_user_id IN (:u)", Map.of("u", users)));
        List<UUID> tenantList = new ArrayList<>(tenants);

        // Children before parents. Each table is keyed by whichever of
        // tenant_id / trainer_id it carries.
        for (String table : List.of(
                "client_message", "client_notification", "workout_feedback", "milestone", "client_prefs", "client_invite",
                "set_log", "session_exercise", "workout_set", "workout_exercise", "package_adjustment",
                "scheduled_session", "payment", "package", "pack", "assessment", "assessment_schedule",
                "assessment_template", "client_note", "client_schedule_slot", "client_schedule",
                "client_assignment", "nudge_log", "nudge_template", "attention_dismissal", "working_hours",
                "trainer_exercise", "gym_arrangement", "trainer_payout", "workout", "program", "exercise",
                "tenant_invite", "client")) {
            purge(table, tenantList, trainers);
        }
        jdbc.update("DELETE FROM exercise WHERE source_id = :s", Map.of("s", "tiso-" + tag));
        for (String table : List.of("trainer_business", "subscription")) purge(table, List.of(), trainers);

        jdbc.update("DELETE FROM tenant_member WHERE app_user_id IN (:u) OR tenant_id IN (:t)",
                Map.of("u", users, "t", tenantList.isEmpty() ? List.of(UUID.randomUUID()) : tenantList));
        jdbc.update("DELETE FROM trainer WHERE id IN (:t)", Map.of("t", trainers.isEmpty() ? List.of(UUID.randomUUID()) : trainers));
        if (!tenantList.isEmpty()) jdbc.update("DELETE FROM tenant WHERE id IN (:t)", Map.of("t", tenantList));
        jdbc.update("DELETE FROM app_user WHERE id IN (:u)", Map.of("u", users));
    }

    private void purge(String table, List<UUID> tenants, List<UUID> trainers) {
        List<String> has = jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :t AND column_name IN ('tenant_id', 'trainer_id')
                """, Map.of("t", table), String.class);
        List<String> where = new ArrayList<>();
        var p = new HashMap<String, Object>();
        if (has.contains("tenant_id") && !tenants.isEmpty()) { where.add("tenant_id IN (:t)"); p.put("t", tenants); }
        if (has.contains("trainer_id") && !trainers.isEmpty()) { where.add("trainer_id IN (:r)"); p.put("r", trainers); }
        if (where.isEmpty()) return;
        jdbc.update("DELETE FROM " + table + " WHERE " + String.join(" OR ", where), p);
    }

    private List<UUID> uuids(String sql, Map<String, ?> params) {
        return jdbc.queryForList(sql, params, UUID.class);
    }

    @Test
    @DisplayName("an unset context returns nothing, never everything")
    void failsClosed() throws SQLException {
        try (Connection c = asAppRole()) {
            // No settings written at all — the state a request that skipped the
            // filter would be in. This is the assertion most likely to break
            // silently, because a policy that fails OPEN looks like a working
            // application until the day somebody notices.
            for (String table : List.of("client", "payment", "package", "pack", "package_adjustment", "set_log",
                    "session_exercise", "scheduled_session", "assessment", "assessment_template", "client_note",
                    "tenant", "tenant_member")) {
                assertThat(count(c, "SELECT count(*) FROM " + table)).as(table).isZero();
            }
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
            // and nothing of Iron House's 5000 — on the payment and on the
            // package it settles.
            staff(c, tenantA, List.of(tenantA, tenantB), trainerPriya);
            assertThat(strings(c, "SELECT amount::text FROM payment")).containsExactly("3000.00");
            assertThat(strings(c, "SELECT amount::text FROM package")).containsExactly("6000.00");

            staff(c, tenantB, List.of(tenantA, tenantB), trainerPriya);
            assertThat(strings(c, "SELECT amount::text FROM payment")).containsExactly("5000.00");
            assertThat(strings(c, "SELECT amount::text FROM package")).containsExactly("8000.00");
        }
    }

    @Test
    @DisplayName("tier 4 · a client session reads exactly its own rows, on both its rosters, and nobody else's")
    void clientLensReadsExactlyItsOwnRows() throws SQLException {
        portalFixtures();

        try (Connection c = asAppRole()) {
            clientSession(c);   // Meera: two roster rows, one person, in two workspaces under two trainers' care

            // who she is — never Sanjay, who is another trainer's client in the same gym
            assertThat(strings(c, "SELECT name FROM client ORDER BY name")).containsExactly("Meera gym", "Meera private");

            // the coaching rows: hers, the trainer-led and the ones she ran herself, and nothing of Sanjay's
            assertThat(strings(c, "SELECT id::text FROM scheduled_session"))
                    .containsExactlyInAnyOrder(sessionLed.toString(), sessionSelf.toString());
            assertThat(strings(c, "SELECT id::text FROM set_log"))
                    .containsExactlyInAnyOrder(setLed.toString(), setSelf.toString());
            assertThat(count(c, "SELECT count(*) FROM session_exercise")).isEqualTo(2);
            // the InclineYou starter programs are on everyone's shelf (client_id is null); a client plan is hers alone
            assertThat(strings(c, "SELECT name FROM program WHERE client_id IS NOT NULL")).containsExactly("Plan Meera");
            assertThat(strings(c, "SELECT w.name FROM workout w JOIN program p ON p.id = w.program_id WHERE p.client_id IS NOT NULL"))
                    .containsExactly("Day Meera");

            // a note is hers only when the trainer shared it; a check-in only once it was sent
            assertThat(strings(c, "SELECT body FROM client_note")).containsExactly("shared with Meera");
            assertThat(strings(c, "SELECT name FROM assessment")).containsExactly("sent to Meera");

            // the money wall, switch on (the default): her own package and payment, not Sanjay's, not the price list
            assertThat(strings(c, "SELECT amount::text FROM package")).containsExactly("6000.00");
            assertThat(strings(c, "SELECT amount::text FROM payment")).containsExactly("3000.00");
            assertThat(count(c, "SELECT count(*) FROM pack")).isZero();

            // V11's own tables, hers only
            assertThat(count(c, "SELECT count(*) FROM client_prefs")).isOne();
            assertThat(strings(c, "SELECT body FROM client_message")).containsExactly("note to Meera");
            assertThat(strings(c, "SELECT text FROM client_notification")).containsExactly("notice for Meera");
            assertThat(strings(c, "SELECT label FROM milestone")).containsExactly("milestone Meera");
            assertThat(count(c, "SELECT count(*) FROM workout_feedback")).isOne();

            // what stays the trainer's: nothing here has a client policy
            for (String table : List.of("assessment_template", "assessment_schedule", "nudge_log", "client_schedule",
                    "attention_dismissal", "tenant_member", "client_invite", "package_adjustment", "gym_arrangement",
                    "trainer_payout")) {
                assertThat(count(c, "SELECT count(*) FROM " + table)).as(table).isZero();
            }
            // the one thing a client may know beyond its rows is the workspaces its roster ids name
            assertThat(strings(c, "SELECT id::text FROM tenant"))
                    .containsExactlyInAnyOrder(tenantA.toString(), tenantB.toString());
        }

        // The ids are the whole story: accepted only at the gym, she reads that row and none of the private one's.
        try (Connection c = asAppRole()) {
            clientSession(c);
            set(c, "app.client_ids", "{" + meeraGym + "}");
            assertThat(strings(c, "SELECT name FROM client")).containsExactly("Meera gym");
            for (String table : List.of("scheduled_session", "package", "payment", "client_note", "assessment",
                    "client_message", "client_prefs")) {
                assertThat(count(c, "SELECT count(*) FROM " + table)).as(table).isZero();
            }
            assertThat(count(c, "SELECT count(*) FROM program WHERE client_id IS NOT NULL")).isZero();
        }

        // And with no accepted row at all a client session is worth nothing — it fails closed, like an unset context.
        try (Connection c = asAppRole()) {
            clientSession(c);
            set(c, "app.client_ids", "");
            for (String table : List.of("client", "scheduled_session", "set_log", "package", "payment", "client_note",
                    "assessment", "client_message", "client_notification", "client_prefs", "milestone")) {
                assertThat(count(c, "SELECT count(*) FROM " + table)).as(table).isZero();
            }
            assertThat(count(c, "SELECT count(*) FROM program WHERE client_id IS NOT NULL")).isZero();
        }
    }

    @Test
    @DisplayName("tier 4 · the trainer's money switch decides what a client reads of the books; the balance never needs it")
    void clientMoneyFollowsTheTrainersSwitch() throws SQLException {
        portalFixtures();
        String balance = "SELECT client_package_balance('" + meeraPrivate + "')";

        jdbc.update("UPDATE trainer SET clients_see_money = false WHERE id = :t::uuid", Map.of("t", trainerPriya.toString()));
        try (Connection c = asAppRole()) {
            clientSession(c);
            assertThat(count(c, "SELECT count(*) FROM package")).isZero();
            assertThat(count(c, "SELECT count(*) FROM payment")).isZero();
            // but "7 sessions left" is not money: the definer function answers, and carries no amount
            assertThat(strings(c, "SELECT (client_package_balance('" + meeraPrivate + "')->0->>'sessions_left')")).containsExactly("10");
            assertThat(strings(c, balance)).noneMatch(json -> json.contains("6000") || json.contains("amount"));
            // and only for her own row
            assertThatThrownBy(() -> strings(c, "SELECT client_package_balance('" + sanjay + "')"))
                    .hasMessageContaining("your own rows");
        }

        // a per-client override beats the trainer's switch, either way
        jdbc.update("UPDATE client SET portal_show_money = true WHERE id = :c::uuid", Map.of("c", meeraPrivate.toString()));
        try (Connection c = asAppRole()) {
            clientSession(c);
            assertThat(strings(c, "SELECT amount::text FROM package")).containsExactly("6000.00");
            assertThat(strings(c, "SELECT amount::text FROM payment")).containsExactly("3000.00");
        }
        jdbc.update("UPDATE trainer SET clients_see_money = true WHERE id = :t::uuid", Map.of("t", trainerPriya.toString()));
        jdbc.update("UPDATE client SET portal_show_money = false WHERE id = :c::uuid", Map.of("c", meeraPrivate.toString()));
        try (Connection c = asAppRole()) {
            clientSession(c);
            assertThat(count(c, "SELECT count(*) FROM package")).isZero();
        }

        // staff are not a client: the function is not a staff route
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThatThrownBy(() -> strings(c, balance)).hasMessageContaining("your own rows");
        }
    }

    @Test
    @DisplayName("tier 4 · a client session writes only what the column guards and policies allow")
    void clientLensWritesOnlyWhatItMay() throws SQLException {
        portalFixtures();
        // Every probe runs in a transaction that is rolled back: this database is the developer's, and a probe that
        // succeeds (as several here must) leaves nothing behind. The settings are written before the transaction opens.
        try (Connection c = asAppRole()) {
            clientSession(c);

            // ── her own row: the five columns she may edit, and nothing else
            inRolledBackTransaction(c, () -> assertThat(update(c,
                    "UPDATE client SET name = 'Meera N', goal = 'strength', height_cm = 165, timezone = 'Asia/Kolkata', activity_level = 'light' "
                            + "WHERE id = '" + meeraPrivate + "'")).isOne());
            for (String column : List.of("phone = '+919000000000'", "status = 'archived'", "date_of_birth = '1990-01-01'",
                    "membership_status = 'removed'", "trainer_id = '" + trainerArun + "'")) {
                inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                        "UPDATE client SET " + column + " WHERE id = '" + meeraPrivate + "'"))
                        .as(column).hasMessageContaining("may not change"));
            }
            // …and somebody else's client is simply not there to update
            inRolledBackTransaction(c, () -> assertThat(update(c, "UPDATE client SET name = 'Hijacked' WHERE id = '" + sanjay + "'")).isZero());

            // ── a check-in: save a draft, submit it once, never reshape it, never reopen a finished one
            inRolledBackTransaction(c, () -> {
                assertThat(update(c, "UPDATE assessment SET answers = '{}'::jsonb, readings = '{}'::jsonb WHERE id = '" + assessmentSent + "'"))
                        .as("a draft saved for later: entered_by stays null until it is submitted").isOne();
                assertThat(update(c, "UPDATE assessment SET completed_at = now(), entered_by = 'client' WHERE id = '" + assessmentSent + "'")).isOne();
                assertThat(update(c, "UPDATE assessment SET answers = '{}'::jsonb WHERE id = '" + assessmentSent + "'"))
                        .as("a submitted check-in is final for the client").isZero();
            });
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE assessment SET entered_by = 'client' WHERE id = '" + assessmentSent + "'"))
                    .as("a draft cannot claim to be submitted").hasMessageContaining("assessment_entered_by_on_completion"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE assessment SET completed_at = now(), entered_by = 'trainer' WHERE id = '" + assessmentSent + "'"))
                    .as("and she cannot submit as the trainer").hasMessageContaining("row-level security"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE assessment SET due_on = due_on + 7 WHERE id = '" + assessmentSent + "'"))
                    .hasMessageContaining("may not change"));
            inRolledBackTransaction(c, () -> assertThat(update(c,
                    "UPDATE assessment SET answers = '{}'::jsonb WHERE id = '" + assessmentUnsent + "'"))
                    .as("a check-in the trainer has not sent is not hers").isZero());

            // ── workouts: she starts and logs her own; the trainer's session is read-only to her
            UUID mine = UUID.randomUUID();
            inRolledBackTransaction(c, () -> assertThat(update(c, ("INSERT INTO scheduled_session (id, tenant_id, trainer_id, client_id, scheduled_at, "
                    + "duration_minutes, ends_at, logged_by, started_at) VALUES ('%s', '%s', '%s', '%s', now(), 40, now(), 'client', now())")
                    .formatted(mine, tenantA, trainerPriya, meeraPrivate))).isOne());
            for (String as : List.of(
                    "'trainer', '%s', '%s'".formatted(trainerPriya, meeraPrivate),    // a booking in the trainer's diary: not hers to make
                    "'client', '%s', '%s'".formatted(trainerArun, meeraPrivate),      // under someone else's trainer id
                    "'client', '%s', '%s'".formatted(trainerPriya, sanjay))) {        // for another person's client
                inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                        ("INSERT INTO scheduled_session (tenant_id, logged_by, trainer_id, client_id, scheduled_at, duration_minutes, ends_at) "
                                + "VALUES ('%s', %s, now(), 40, now())").formatted(tenantA, as)))
                        .as(as).hasMessageContaining("row-level security"));
            }
            inRolledBackTransaction(c, () -> {
                assertThat(update(c, "UPDATE scheduled_session SET status = 'done', ended_at = now(), paused_seconds = 30 WHERE id = '" + sessionSelf + "'")).isOne();
                assertThatThrownBy(() -> update(c, "UPDATE scheduled_session SET notes = 'x' WHERE id = '" + sessionSelf + "'"))
                        .hasMessageContaining("may not change");
            });
            for (String change : List.of("status = 'done'", "scheduled_at = scheduled_at + interval '1 day'", "workout_id = NULL")) {
                inRolledBackTransaction(c, () -> assertThat(update(c, "UPDATE scheduled_session SET " + change + " WHERE id = '" + sessionLed + "'"))
                        .as("a trainer-led session is read-only to the client: " + change).isZero());
            }

            // ── sets: she logs on her own day, as herself; the trainer's sets are not hers to touch
            inRolledBackTransaction(c, () -> assertThat(update(c,
                    "UPDATE set_log SET load_value = 45, effort_value = 6, rpe = 8, entered_by = 'client' WHERE id = '" + setSelf + "'")).isOne());
            inRolledBackTransaction(c, () -> assertThat(update(c, "UPDATE set_log SET load_value = 99 WHERE id = '" + setLed + "'")).isZero());
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE set_log SET entered_by = 'trainer' WHERE id = '" + setSelf + "'")).hasMessageContaining("row-level security"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE set_log SET planned = true WHERE id = '" + setSelf + "'")).hasMessageContaining("may not change"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    ("INSERT INTO set_log (tenant_id, session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at, entered_by) "
                            + "SELECT tenant_id, id, 9, false, 'weight', 'reps', 1, 1, now(), 'client' FROM session_exercise WHERE session_id = '%s'")
                            .formatted(sessionLed))).hasMessageContaining("row-level security"));

            // ── her own settings, and her bell: switches and read marks, never the content
            inRolledBackTransaction(c, () -> assertThat(update(c,
                    "UPDATE client_prefs SET hide_weight = true, notify_session_reminder = false, auto_rest_timer = false, "
                            + "nominee_name = 'Asha', nominee_phone = '+919800000001' WHERE client_id = '" + meeraPrivate + "'")).isOne());
            inRolledBackTransaction(c, () -> assertThat(update(c, "UPDATE client_prefs SET hide_weight = true WHERE client_id = '" + sanjay + "'")).isZero());
            inRolledBackTransaction(c, () -> assertThat(update(c, "UPDATE client_notification SET read_at = now() WHERE id = '" + notificationMeera + "'")).isOne());
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE client_notification SET text = 'rewritten' WHERE id = '" + notificationMeera + "'")).hasMessageContaining("may not change"));
            inRolledBackTransaction(c, () -> assertThat(update(c, "UPDATE client_message SET read_at = now() WHERE client_id = '" + meeraPrivate + "'")).isOne());
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> update(c,
                    "UPDATE client_message SET body = 'rewritten' WHERE client_id = '" + meeraPrivate + "'")).hasMessageContaining("may not change"));

            // ── what she can never write: the books, the trainer's words, her own milestones, an invite
            for (String insert : List.of(
                    "INSERT INTO client_note (tenant_id, client_id, trainer_id, body) VALUES ('%s', '%s', '%s', 'forged')".formatted(tenantA, meeraPrivate, trainerPriya),
                    "INSERT INTO payment (tenant_id, trainer_id, client_id, package_id, amount, currency, status, paid_at, method) VALUES ('%s', '%s', '%s', '%s', 1, 'INR', 'paid', now(), 'cash')".formatted(tenantA, trainerPriya, meeraPrivate, packageMeera),
                    "INSERT INTO package_adjustment (tenant_id, trainer_id, package_id, client_id, kind, sessions) VALUES ('%s', '%s', '%s', '%s', 'sessions', 5)".formatted(tenantA, trainerPriya, packageMeera, meeraPrivate),
                    "INSERT INTO client (tenant_id, trainer_id, name, client_type) VALUES ('%s', '%s', 'Planted', 'independent')".formatted(tenantA, trainerPriya),
                    "INSERT INTO client_message (tenant_id, client_id, trainer_id, body) VALUES ('%s', '%s', '%s', 'from the trainer?')".formatted(tenantA, meeraPrivate, trainerPriya),
                    "INSERT INTO client_notification (tenant_id, client_id, kind, text) VALUES ('%s', '%s', 'note', 'self-sent')".formatted(tenantA, meeraPrivate),
                    "INSERT INTO milestone (tenant_id, client_id, kind, label, value) VALUES ('%s', '%s', 'sessions_50', 'self-awarded', 50)".formatted(tenantA, meeraPrivate),
                    "INSERT INTO client_invite (tenant_id, trainer_id, client_id, phone, token_hash) VALUES ('%s', '%s', '%s', '+919111111111', repeat('a', 64))".formatted(tenantA, trainerPriya, meeraPrivate),
                    "INSERT INTO assessment (client_id, trainer_id, tenant_id, name, form, due_on, sent_at) VALUES ('%s', '%s', '%s', 'self-made', '{\"measurements\":[],\"questions\":[]}'::jsonb, CURRENT_DATE, now())".formatted(meeraPrivate, trainerPriya, tenantA))) {
                inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c, insert))
                        .as(insert).hasMessageContaining("row-level security"));
            }
        }

        // Nothing the probes did survived: the rows are as the fixtures left them.
        assertThat(jdbc.queryForObject("SELECT name FROM client WHERE id = :id::uuid", Map.of("id", meeraPrivate.toString()), String.class))
                .isEqualTo("Meera private");
        assertThat(jdbc.queryForObject("SELECT status FROM scheduled_session WHERE id = :id::uuid", Map.of("id", sessionSelf.toString()), String.class))
                .isEqualTo("scheduled");
    }

    @Test
    @DisplayName("a write cannot land in a workspace you are not standing in")
    void writeCheckHolds() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA, tenantB), trainerPriya);
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO client (tenant_id, trainer_id, name, client_type)
                    VALUES ('%s', '%s', 'Smuggled', 'independent')
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
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE package SET tenant_id = :b::uuid WHERE id = :id::uuid",
                Map.of("b", tenantB.toString(), "id", packageMeera.toString())))
                .hasMessageContaining("immutable");
    }

    @Test
    @DisplayName("V14 · an assessment template and an assessment are their workspace's")
    void assessmentIsTierOne() throws SQLException {
        UUID clientA = insertClient(tenantA, trainerPriya, "Asha", null);
        UUID tpl = template(tenantA, trainerPriya, "Priya monthly");
        jdbc.update("""
                INSERT INTO assessment (client_id, trainer_id, tenant_id, template_id, name, form, due_on)
                VALUES (:c::uuid, :t::uuid, :tid::uuid, :tpl::uuid, 'Priya monthly',
                        '{"measurements":[],"questions":[]}'::jsonb, CURRENT_DATE)
                """, Map.of("c", clientA.toString(), "t", trainerPriya.toString(), "tid", tenantA.toString(),
                            "tpl", tpl.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM assessment_template WHERE name = 'Priya monthly'")).isZero();
            assertThat(count(c, "SELECT count(*) FROM assessment WHERE name = 'Priya monthly'")).isZero();
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM assessment_template WHERE name = 'Priya monthly'")).isOne();
            assertThat(count(c, "SELECT count(*) FROM assessment WHERE name = 'Priya monthly'")).isOne();
        }
    }

    @Test
    @DisplayName("V13 · a saved workout is its workspace's: invisible from another, and cannot be written into one")
    void workoutIsTierOne() throws SQLException {
        // v1 renamed workout_template to workout (origin 'trainer'; origin
        // 'inclineyou' rows are the global library, tenant_id NULL).
        jdbc.update("""
                INSERT INTO workout (trainer_id, tenant_id, origin, name)
                VALUES (:t::uuid, :tid::uuid, 'trainer', 'Priya upper A')
                """, Map.of("t", trainerPriya.toString(), "tid", tenantA.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM workout WHERE name = 'Priya upper A'")).isZero();
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO workout (trainer_id, tenant_id, origin, name)
                    VALUES ('%s', '%s', 'trainer', 'Planted')
                    """.formatted(trainerArun, tenantA))).hasMessageContaining("row-level security");
        }
    }

    @Test
    @DisplayName("a working week is its trainer's own, even to a teammate in the same workspace")
    void workingHoursAreTheTrainersOwn() throws SQLException {
        // working_hours (and nudge_template) are keyed on trainer_id, not on a
        // workspace — a week belongs to a person who spans workspaces.
        jdbc.update("""
                INSERT INTO working_hours (trainer_id, weekday, start_time, end_time)
                VALUES (:t::uuid, 1, '06:00', '11:00')
                """, Map.of("t", trainerPriya.toString()));
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM working_hours")).isZero();
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM working_hours")).isOne();
        }
    }

    @Test
    @DisplayName("V11 · certified programs are readable from any workspace and writable from none")
    void certifiedIsReadOnlyCatalogue() throws SQLException {
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(count(c, "SELECT count(*) FROM certified_program")).isGreaterThanOrEqualTo(1);
            // No UPDATE policy: the row is invisible to the UPDATE, so nothing changes.
            assertThat(update(c, "UPDATE certified_program SET used_count = 999")).isZero();
            // The write check is evaluated before any foreign key, so a random
            // program_id is enough to prove it is the policy refusing.
            assertThatThrownBy(() -> exec(c, """
                    INSERT INTO certified_program (program_id, summary, level, equipment)
                    VALUES (gen_random_uuid(), 'x', 'beginner', 'full_gym')
                    """)).hasMessageContaining("row-level security");
        }
    }

    @Test
    @DisplayName("the shared catalogue is readable everywhere, a custom exercise is not")
    void catalogueIsSharedAndCustomIsNot() throws SQLException {
        jdbc.update("INSERT INTO exercise (name, origin, source_id) VALUES (:n, 'inclineyou', :s)",
                Map.of("n", "Barbell Squat " + tag, "s", "tiso-" + tag));
        jdbc.update("""
                INSERT INTO exercise (name, origin, trainer_id, tenant_id)
                VALUES ('Priya special', 'trainer', :t::uuid, :tid::uuid)
                """, Map.of("t", trainerPriya.toString(), "tid", tenantA.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            assertThat(strings(c, "SELECT name FROM exercise WHERE origin = 'trainer'"))
                    .doesNotContain("Priya special");
            assertThat(strings(c, "SELECT name FROM exercise WHERE origin = 'inclineyou'"))
                    .contains("Barbell Squat " + tag);
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(strings(c, "SELECT name FROM exercise WHERE origin = 'trainer'"))
                    .contains("Priya special");
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
        String phone = newPhone();
        UUID id = UUID.randomUUID();

        try (Connection c = asAppRole()) {
            set(c, "app.actor", "staff");
            set(c, "app.phone", phone);

            exec(c, "INSERT INTO app_user (phone, role) VALUES ('" + phone + "', 'trainer')");
            exec(c, "INSERT INTO trainer (id, app_user_id, name) SELECT '" + id + "'::uuid, id, 'Nikhil " + tag
                    + "' FROM app_user WHERE phone = '" + phone + "'");

            // The workspace exists, and the trigger — not the caller — made it:
            // the caller is its owner and it is their home.
            assertThat(strings(c, "SELECT role || '/' || is_home FROM tenant_member WHERE app_user_id ="
                    + " (SELECT id FROM app_user WHERE phone = '" + phone + "')")).containsExactly("owner/true");
            // And the trial clock started, with no request able to skip or remove it.
            assertThat(count(c, "SELECT count(*) FROM subscription WHERE trainer_id = '" + id + "'")).isOne();

            // And the privilege stayed inside the trigger: the app role still
            // cannot write a workspace of its own choosing. If this ever passes,
            // SECURITY DEFINER has been turned into a hole rather than a door.
            assertThatThrownBy(() -> exec(c, "INSERT INTO tenant (type, name) VALUES ('gym', 'Fake')"))
                    .hasMessageContaining("row-level security");
        }

        assertThat(homeTenantOf(id)).isNotNull();
    }

    @Test
    @DisplayName("the home membership is written by the trainer insert, as owner and as the home")
    void homeMembershipComesWithTheTrainer() {
        // The old test pinned "whichever row lands second completes the pair",
        // because sign-up used to write trainer and app_user in either order. In
        // v1 trainer.app_user_id is a NOT NULL foreign key, so the order is
        // forced — the user first — and the AFTER INSERT trigger on trainer is
        // the one that writes the membership. Pinned here as the v1 property.
        var row = jdbc.queryForMap("""
                SELECT m.role, m.status, m.is_home, m.tenant_type
                FROM tenant_member m
                WHERE m.app_user_id = :u::uuid AND m.tenant_id = :t::uuid
                """, Map.of("u", userPriya.toString(), "t", tenantA.toString()));
        assertThat(row.get("role")).isEqualTo("owner");
        assertThat(row.get("status")).isEqualTo("active");
        assertThat(row.get("is_home")).isEqualTo(true);
        assertThat(row.get("tenant_type")).isEqualTo("solo");
        // and the gym membership added by hand is not a second home.
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM tenant_member WHERE app_user_id = :u::uuid AND is_home",
                Map.of("u", userPriya.toString()), Long.class)).isOne();
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
                        "INSERT INTO exercise (name, origin, source_id) VALUES ('Injected global', 'inclineyou', 'tiso-" + tag + "')"))
                        .hasMessageContaining("row-level security");
            });
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "INSERT INTO program (origin, name) VALUES ('inclineyou', 'Injected program " + tag + "')"))
                    .hasMessageContaining("row-level security"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "INSERT INTO workout (origin, name) VALUES ('inclineyou', 'Injected workout " + tag + "')"))
                    .hasMessageContaining("row-level security"));
            inRolledBackTransaction(c, () -> {
                assertThat(update(c, "UPDATE exercise SET name = name WHERE origin = 'inclineyou'")).isZero();
                // Their own custom movement is still theirs to write.
                exec(c, "INSERT INTO exercise (name, origin, trainer_id) VALUES ('Priya V21 " + tag + "', 'trainer', '"
                        + trainerPriya + "'::uuid)");
            });
        }
        try (Connection c = asAppRole()) {
            clientSession(c);
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "INSERT INTO exercise (name, origin, source_id) VALUES ('Client global', 'inclineyou', 'tiso-" + tag + "')"))
                    .hasMessageContaining("row-level security"));
        }
        try (Connection c = asAppRole()) {
            // What ExerciseSeeder declares at boot, and nothing else can.
            set(c, "app.actor", "system");
            inRolledBackTransaction(c, () -> exec(c,
                    "INSERT INTO exercise (name, origin, source_id) VALUES ('Seeded V21', 'inclineyou', 'tiso-" + tag + "')"));
        }
    }

    @Test
    @DisplayName("V21 · the request role cannot hard-delete, nor rewrite an append-only log")
    void noHardDeleteAndLogsAreAppendOnly() throws SQLException {
        // The adjustment is a ledger row; writing it as the owner moves the
        // package's balance exactly as a request would.
        jdbc.update("""
                INSERT INTO package_adjustment (trainer_id, package_id, client_id, kind, days, sessions)
                VALUES (:t::uuid, :p::uuid, :c::uuid, 'sessions', 0, 2)
                """, Map.of("t", trainerPriya.toString(), "p", packageMeera.toString(), "c", meeraPrivate.toString()));

        try (Connection c = asAppRole()) {
            staff(c, tenantA, List.of(tenantA), trainerPriya);
            assertThat(count(c, "SELECT count(*) FROM package_adjustment")).isOne();
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c, "DELETE FROM payment"))
                    .hasMessageContaining("permission denied"));
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c, "DELETE FROM package_adjustment"))
                    .hasMessageContaining("permission denied"));
            // UPDATE is granted (a session charge's reversed_at is set once), so
            // the append-only property is a trigger, not a privilege.
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "UPDATE package_adjustment SET sessions = 500"))
                    .hasMessageContaining("append-only"));
        }
    }

    @Test
    @DisplayName("V21 · only its owner renames a workspace, and no request mints an owner")
    void workspaceRootIsOwnerOnly() throws SQLException {
        try (Connection c = asAppRole()) {
            // Priya coaches at Iron House; Arun owns it.
            staff(c, tenantB, List.of(tenantB), trainerPriya);
            inRolledBackTransaction(c, () -> {
                assertThat(update(c, "UPDATE tenant SET name = 'Renamed' WHERE id = '" + tenantB + "'")).isZero();
                assertThatThrownBy(() -> exec(c, "INSERT INTO tenant_member (tenant_id, app_user_id, role) VALUES ('"
                        + tenantB + "'::uuid, '" + userPriya + "'::uuid, 'owner')"))
                        .hasMessageContaining("row-level security");
            });
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "UPDATE tenant_member SET role = 'owner' WHERE tenant_id = '" + tenantB
                            + "' AND app_user_id = '" + userPriya + "'"))
                    .hasMessageContaining("may not make a workspace member an owner"));
        }
        try (Connection c = asAppRole()) {
            staff(c, tenantB, List.of(tenantB), trainerArun);
            inRolledBackTransaction(c, () ->
                    assertThat(update(c, "UPDATE tenant SET name = 'Iron House Gym' WHERE id = '" + tenantB + "'")).isOne());
        }
    }

    @Test
    @DisplayName("V21 · a child row cannot sit in a different workspace from its parent")
    void childFollowsParentWorkspace() {
        // Written as the owner, which bypasses every policy — so this is the
        // foreign key alone doing the refusing.
        assertThatThrownBy(() -> payment(tenantB, meeraPrivate, trainerPriya, packageMeera, 100))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("payment_package_owner");
        assertThatThrownBy(() -> pack(tenantB, meeraPrivate, trainerPriya, 100))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("package_client_same_tenant");
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
            inRolledBackTransaction(c, () -> assertThatThrownBy(() -> exec(c,
                    "INSERT INTO subscription (trainer_id, price_amount, currency) VALUES ('" + trainerArun + "', 1, 'INR')"))
                    .hasMessageContaining("permission denied"));
        }
    }

    /* ----------------------------------------------------------- machinery */

    @FunctionalInterface
    private interface SqlBlock { void run() throws Exception; }

    /**
     * Runs a block and rolls it back, so a probe that succeeds leaves no row
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
        // app.phone is read by app_owns_tenant() and the two bootstrap policies —
        // a helper that mirrors the runtime has to mirror all of it, or it tests a
        // session shape that never occurs.
        set(c, "app.phone", phoneOf(trainerId));
        set(c, "app.tenant_id", active.toString());
        set(c, "app.tenant_ids", TenantContext.array(readable));
        set(c, "app.trainer_id", trainerId.toString());
        set(c, "app.client_ids", "");
    }

    /** What {@code TenantContext.client(...)} writes: Meera, in both workspaces, on both rosters. */
    private void clientSession(Connection c) throws SQLException {
        set(c, "app.actor", "client");
        set(c, "app.phone", phoneMeera);
        set(c, "app.tenant_id", tenantB.toString());
        set(c, "app.tenant_ids", TenantContext.array(List.of(tenantA, tenantB)));
        set(c, "app.trainer_id", "");
        set(c, "app.client_ids", "{" + meeraPrivate + "," + meeraGym + "}");
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

    /**
     * A random E.164 Indian mobile ({@code +91[6-9]xxxxxxxxx}), recorded so
     * cleanUp() can find what hangs off it. Random, not derived from the clock:
     * the database is shared and holds real numbers.
     */
    private String newPhone() {
        var r = ThreadLocalRandom.current();
        String phone = "+91" + (6 + r.nextInt(4)) + String.format("%09d", r.nextInt(1_000_000_000));
        phones.add(phone);
        return phone;
    }

    private UUID insertUser(String phone, String role) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (:id::uuid, :p, :r)",
                Map.of("id", id.toString(), "p", phone, "r", role));
        return id;
    }

    private UUID insertTrainer(UUID appUserId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (:id::uuid, :u::uuid, :n)",
                Map.of("id", id.toString(), "u", appUserId.toString(), "n", name));
        return id;
    }

    /** Read as the owner: the harness is allowed to know things the role cannot. The phone lives on app_user in v1. */
    private String phoneOf(UUID trainerId) {
        return jdbc.queryForObject("""
                SELECT au.phone FROM trainer t JOIN app_user au ON au.id = t.app_user_id WHERE t.id = :id::uuid
                """, Map.of("id", trainerId.toString()), String.class);
    }

    private UUID homeTenantOf(UUID trainerId) {
        return UUID.fromString((String) jdbc.queryForList(
                "SELECT home_tenant_id::text AS id FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainerId.toString())).getFirst().get("id"));
    }

    private void member(UUID tenantId, UUID appUserId, String role) {
        // tenant_type is stamped from the tenant by trigger.
        jdbc.update("""
                INSERT INTO tenant_member (tenant_id, app_user_id, role, status, is_home)
                VALUES (:t::uuid, :u::uuid, :r, 'active', FALSE)
                ON CONFLICT DO NOTHING
                """, Map.of("t", tenantId.toString(), "u", appUserId.toString(), "r", role));
    }

    private UUID insertClient(UUID tenantId, UUID trainerId, String name, String phone) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", tenantId.toString());
        p.put("tr", trainerId.toString());
        p.put("n", name);
        p.put("ph", phone);
        jdbc.update("""
                INSERT INTO client (id, tenant_id, trainer_id, name, phone, client_type)
                VALUES (:id::uuid, :tid::uuid, :tr::uuid, :n, :ph, 'independent')
                """, p);
        return id;
    }

    /** A package the client bought, which is what a payment must settle in v1. */
    private UUID pack(UUID tenantId, UUID clientId, UUID trainerId, int amount) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO package (id, tenant_id, client_id, trainer_id, name, service, amount, sessions_total, sessions_remaining)
                VALUES (:id::uuid, :tid::uuid, :c::uuid, :tr::uuid, 'Pack', 'floor', :a, 10, 10)
                """, Map.of("id", id.toString(), "tid", tenantId.toString(), "c", clientId.toString(),
                            "tr", trainerId.toString(), "a", amount));
        return id;
    }

    private void payment(UUID tenantId, UUID clientId, UUID trainerId, UUID packageId, int amount) {
        // currency comes from the workspace and collected_by from the client, both by trigger.
        jdbc.update("""
                INSERT INTO payment (tenant_id, client_id, trainer_id, package_id, amount, status, paid_at, method)
                VALUES (:tid::uuid, :c::uuid, :tr::uuid, :p::uuid, :a, 'paid', NOW(), 'cash')
                """, Map.of("tid", tenantId.toString(), "c", clientId.toString(),
                            "tr", trainerId.toString(), "p", packageId.toString(), "a", amount));
    }

    private UUID template(UUID tenantId, UUID trainerId, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment_template (id, trainer_id, tenant_id, name) VALUES (:id::uuid, :t::uuid, :tid::uuid, :n)
                """, Map.of("id", id.toString(), "t", trainerId.toString(), "tid", tenantId.toString(), "n", name));
        return id;
    }

    private void assessmentFor(UUID clientId, UUID trainerId, UUID tenantId, UUID templateId) {
        jdbc.update("""
                INSERT INTO assessment (client_id, trainer_id, tenant_id, template_id, name, form, due_on, sent_at)
                VALUES (:c::uuid, :t::uuid, :tid::uuid, :tpl::uuid, 'x',
                        '{"measurements":[],"questions":[]}'::jsonb, CURRENT_DATE, now())
                """, Map.of("c", clientId.toString(), "t", trainerId.toString(),
                            "tid", tenantId.toString(), "tpl", templateId.toString()));
    }

    /**
     * What the portal tests read and write, built as the owner. Meera has a trainer-led session and a workout she ran
     * herself, each with a set; a shared and a private note; a sent and an unsent check-in; a plan; and one row in each
     * of V11's tables. Sanjay, another trainer's client at the gym, has a counterpart of every one of them, so a read
     * that forgot to filter would show up as a second row.
     */
    private void portalFixtures() {
        UUID exercise = UUID.randomUUID();
        jdbc.update("INSERT INTO exercise (id, name, origin, log_type, source_id) VALUES (:id::uuid, 'Squat', 'inclineyou', 'weight_reps', :src)",
                Map.of("id", exercise.toString(), "src", "tiso-" + tag));

        sessionLed = session(tenantA, trainerPriya, meeraPrivate, "trainer", "scheduled");
        sessionSelf = session(tenantA, trainerPriya, meeraPrivate, "client", "scheduled");
        sessionSanjay = session(tenantB, trainerArun, sanjay, "trainer", "scheduled");
        setLed = setOn(tenantA, sessionLed, meeraPrivate, exercise, "trainer");
        setSelf = setOn(tenantA, sessionSelf, meeraPrivate, exercise, "client");
        setSanjay = setOn(tenantB, sessionSanjay, sanjay, exercise, "trainer");

        UUID tplA = template(tenantA, trainerPriya, "tpl " + tag);
        UUID tplB = template(tenantB, trainerArun, "tpl b " + tag);
        assessmentSent = assessment(tenantA, trainerPriya, meeraPrivate, tplA, "sent to Meera", true);
        assessmentUnsent = assessment(tenantA, trainerPriya, meeraPrivate, tplA, "unsent to Meera", false);
        assessment(tenantB, trainerArun, sanjay, tplB, "sent to Sanjay", true);

        note(tenantA, trainerPriya, meeraPrivate, "private to Priya", false);
        note(tenantA, trainerPriya, meeraPrivate, "shared with Meera", true);
        note(tenantB, trainerArun, sanjay, "shared with Sanjay", true);

        plan(tenantA, trainerPriya, meeraPrivate, "Plan Meera", "Day Meera");
        plan(tenantB, trainerArun, sanjay, "Plan Sanjay", "Day Sanjay");

        for (var who : List.of(new Object[]{tenantA, trainerPriya, meeraPrivate, sessionSelf, "Meera"},
                               new Object[]{tenantB, trainerArun, sanjay, sessionSanjay, "Sanjay"})) {
            var p = new HashMap<String, Object>();
            p.put("ten", who[0].toString()); p.put("tr", who[1].toString()); p.put("c", who[2].toString());
            p.put("s", who[3].toString()); p.put("n", who[4]);
            jdbc.update("INSERT INTO client_prefs (client_id, tenant_id) VALUES (:c::uuid, :ten::uuid)", p);
            jdbc.update("INSERT INTO client_message (tenant_id, client_id, trainer_id, body) VALUES (:ten::uuid, :c::uuid, :tr::uuid, 'note to ' || :n)", p);
            jdbc.update("INSERT INTO milestone (tenant_id, client_id, kind, label, value) VALUES (:ten::uuid, :c::uuid, 'sessions_10', 'milestone ' || :n, 10)", p);
            jdbc.update("INSERT INTO workout_feedback (tenant_id, session_id, client_id, effort) VALUES (:ten::uuid, :s::uuid, :c::uuid, 'right')", p);
            UUID n = UUID.randomUUID();
            p.put("id", n.toString());
            jdbc.update("INSERT INTO client_notification (id, tenant_id, client_id, kind, text) VALUES (:id::uuid, :ten::uuid, :c::uuid, 'note', 'notice for ' || :n)", p);
            if ("Meera".equals(who[4])) notificationMeera = n;
        }
    }

    private UUID session(UUID tenantId, UUID trainerId, UUID clientId, String loggedBy, String status) {
        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString()); p.put("ten", tenantId.toString()); p.put("tr", trainerId.toString());
        p.put("c", clientId.toString()); p.put("by", loggedBy); p.put("st", status);
        jdbc.update("""
                INSERT INTO scheduled_session (id, tenant_id, trainer_id, client_id, scheduled_at, duration_minutes, ends_at, status, logged_by, started_at)
                VALUES (:id::uuid, :ten::uuid, :tr::uuid, :c::uuid, now(), 60, now(), :st, :by, now())
                """, p);
        return id;
    }

    /** One planned-then-logged set on a fresh exercise row of the session; returns the set's id. */
    private UUID setOn(UUID tenantId, UUID sessionId, UUID clientId, UUID exercise, String enteredBy) {
        UUID sx = UUID.randomUUID(), set = UUID.randomUUID();
        jdbc.update("INSERT INTO session_exercise (id, tenant_id, session_id, client_id, exercise_id, position) VALUES (:id::uuid, :ten::uuid, :s::uuid, :c::uuid, :e::uuid, 0)",
                Map.of("id", sx.toString(), "ten", tenantId.toString(), "s", sessionId.toString(), "c", clientId.toString(), "e", exercise.toString()));
        jdbc.update("""
                INSERT INTO set_log (id, tenant_id, session_exercise_id, position, planned, load_kind, effort_kind, load_value, effort_value, done_at, entered_by)
                VALUES (:id::uuid, :ten::uuid, :sx::uuid, 1, false, 'weight', 'reps', 40, 8, now(), :by)
                """, Map.of("id", set.toString(), "ten", tenantId.toString(), "sx", sx.toString(), "by", enteredBy));
        return set;
    }

    private UUID assessment(UUID tenantId, UUID trainerId, UUID clientId, UUID templateId, String name, boolean sent) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, tenant_id, template_id, name, form, due_on, sent_at)
                VALUES (:id::uuid, :c::uuid, :t::uuid, :ten::uuid, :tpl::uuid, :n, '{"measurements":[],"questions":[]}'::jsonb, CURRENT_DATE,
                        CASE WHEN :sent THEN now() END)
                """, Map.of("id", id.toString(), "c", clientId.toString(), "t", trainerId.toString(), "ten", tenantId.toString(),
                            "tpl", templateId.toString(), "n", name, "sent", sent));
        return id;
    }

    private void note(UUID tenantId, UUID trainerId, UUID clientId, String body, boolean shared) {
        jdbc.update("""
                INSERT INTO client_note (tenant_id, client_id, trainer_id, body, shared_with_client, shared_at)
                VALUES (:ten::uuid, :c::uuid, :t::uuid, :b, :sh, CASE WHEN :sh THEN now() END)
                """, Map.of("ten", tenantId.toString(), "c", clientId.toString(), "t", trainerId.toString(), "b", body, "sh", shared));
    }

    private void plan(UUID tenantId, UUID trainerId, UUID clientId, String program, String workout) {
        UUID p = UUID.randomUUID();
        jdbc.update("INSERT INTO program (id, origin, trainer_id, tenant_id, client_id, status, name, weeks) VALUES (:id::uuid, 'trainer', :t::uuid, :ten::uuid, :c::uuid, 'active', :n, 4)",
                Map.of("id", p.toString(), "t", trainerId.toString(), "ten", tenantId.toString(), "c", clientId.toString(), "n", program));
        jdbc.update("INSERT INTO workout (id, origin, trainer_id, tenant_id, program_id, week, day, position, name) VALUES (gen_random_uuid(), 'trainer', :t::uuid, :ten::uuid, :p::uuid, 1, 1, 0, :n)",
                Map.of("t", trainerId.toString(), "ten", tenantId.toString(), "p", p.toString(), "n", workout));
    }
}
