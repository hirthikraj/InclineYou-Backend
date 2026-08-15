package com.xrep.xrep_backend.sync;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What happens to a roster row when the number on it belongs to a trainer.
 *
 * The rule is that one phone has one role, so a trainer's number can never be
 * invited as a client. The interesting part is what that does to the TRAINER's
 * record of that person, and the answer is: nothing. Only the invite is
 * impossible. Dropping the row — which is what this used to do — silently cost
 * the trainer a client, their sessions and their payments to enforce a rule
 * about app access, and told them nothing.
 *
 * The transitions below are a small state machine buried in a SQL CASE, which
 * is exactly the kind of thing that breaks quietly, so it is pinned here.
 *
 * `@Transactional` on the test rolls everything back — this suite runs against
 * the dev database and must not leave anything in it.
 */
@SpringBootTest
@Transactional
class SyncMembershipTest {

    @Autowired SyncService sync;
    @Autowired NamedParameterJdbcTemplate jdbc;

    /** A trainer's number, and a number belonging to nobody. */
    private static final String TRAINER_PHONE = "9100000001";
    private static final String CLIENT_PHONE = "9100000002";

    private UUID adder;
    private UUID clientId;

    @BeforeEach
    void setUp() {
        adder = trainer("9100000003");
        // The number that is already spoken for, and the identity that says so.
        trainer(TRAINER_PHONE);
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", TRAINER_PHONE));
        clientId = UUID.randomUUID();
    }

    @Test
    @DisplayName("a trainer's number is saved as `unavailable`, not dropped")
    void blockedNumberIsKept() {
        push(created(TRAINER_PHONE));

        // The row exists. This is the whole regression: it used to be skipped.
        assertThat(membershipStatus()).isEqualTo("unavailable");
        assertThat(invitedAt()).isNull();

        // And no client identity was minted for a number that is a trainer's.
        assertThat(role(TRAINER_PHONE)).isEqualTo("trainer");
    }

    @Test
    @DisplayName("correcting the number makes the invite possible")
    void correctingTheNumberRecovers() {
        push(created(TRAINER_PHONE));
        push(updated(CLIENT_PHONE));

        assertThat(membershipStatus()).isEqualTo("invited");
        assertThat(invitedAt()).isNotNull();
        // The identity is created at the moment the number becomes invitable.
        assertThat(role(CLIENT_PHONE)).isEqualTo("client");
    }

    @Test
    @DisplayName("editing back to a trainer's number blocks it again")
    void editingBackReBlocks() {
        push(created(TRAINER_PHONE));
        push(updated(CLIENT_PHONE));
        push(updated(TRAINER_PHONE));

        // Not left as `invited` on the strength of having once been correct —
        // the invite cannot be delivered, so the roster must not claim it was.
        assertThat(membershipStatus()).isEqualTo("unavailable");
        assertThat(invitedAt()).isNull();
    }

    @Test
    @DisplayName("a normal client is unaffected by any of this")
    void normalClientIsUntouched() {
        push(created(CLIENT_PHONE));

        assertThat(membershipStatus()).isEqualTo("invited");
        assertThat(invitedAt()).isNotNull();
    }

    /* ------------------------------------------------------------- fixtures */

    private UUID trainer(String phone) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO trainer (id, phone, name) VALUES (:id::uuid, :phone, :phone)
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("id", id.toString(), "phone", phone));
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id::text FROM trainer WHERE phone = :phone",
                Map.of("phone", phone), String.class));
    }

    private Map<String, Object> created(String phone) {
        return Map.of("changes", Map.of("clients", Map.of(
                "created", List.of(row(phone)), "updated", List.of(), "deleted", List.of())));
    }

    private Map<String, Object> updated(String phone) {
        return Map.of("changes", Map.of("clients", Map.of(
                "created", List.of(), "updated", List.of(row(phone)), "deleted", List.of())));
    }

    private Map<String, Object> row(String phone) {
        return Map.of("id", clientId.toString(), "name", "Meera",
                "phone", phone, "status", "active");
    }

    private void push(Map<String, Object> body) {
        sync.push(adder, body);
    }

    private String membershipStatus() {
        return jdbc.queryForObject(
                "SELECT membership_status FROM client WHERE id = :id::uuid",
                Map.of("id", clientId.toString()), String.class);
    }

    private Object invitedAt() {
        return jdbc.queryForObject(
                "SELECT invited_at FROM client WHERE id = :id::uuid",
                Map.of("id", clientId.toString()), Object.class);
    }

    private String role(String phone) {
        var rows = jdbc.queryForList(
                "SELECT role FROM app_user WHERE phone = :p", Map.of("p", phone), String.class);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
