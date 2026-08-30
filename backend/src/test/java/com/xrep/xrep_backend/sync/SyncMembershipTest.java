package com.xrep.xrep_backend.sync;

import com.xrep.xrep_backend.client.ClientPhoneGuard;
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
 * Who a push is allowed to put on a roster.
 *
 * Trainer/client duality is now allowed: another trainer's number is a normal
 * add. Two numbers can still never be added: the adder's OWN number (the
 * unresolved "self-training" case), and one that is already another
 * trainer's live client or already on the adder's own roster. Those are
 * refused outright — the row is not created — and the push says so in its
 * response rather than failing the batch around it.
 *
 * This suite used to pin a stricter rule — ANY trainer's number was refused —
 * and, before that, an even older bug where a trainer's number was SAVED as
 * `unavailable` and only the invite was withheld (T1 could add T2 and the
 * roster showed a client who was somebody else). The recovery path out of
 * `unavailable` is still tested below, because rows written before the rule
 * hardened still carry it and still have to heal.
 *
 * `@Transactional` on the test rolls everything back — this suite runs against
 * the dev database and must not leave anything in it.
 */
@SpringBootTest
@Transactional
class SyncMembershipTest {

    @Autowired SyncService sync;
    @Autowired NamedParameterJdbcTemplate jdbc;

    /** Another trainer's number, and a number belonging to nobody. */
    private static final String TRAINER_PHONE = "9100000001";
    private static final String CLIENT_PHONE = "9100000002";
    /** The adder's own number. */
    private static final String ADDER_PHONE = "9100000003";
    /** On a third trainer's roster before this test starts. */
    private static final String TAKEN_PHONE = "9100000004";

    private UUID adder;
    private UUID clientId;

    @BeforeEach
    void setUp() {
        adder = trainer(ADDER_PHONE);
        // Another trainer's identity, now addable as a client.
        trainer(TRAINER_PHONE);
        jdbc.update("""
                INSERT INTO app_user (phone, role) VALUES (:p, 'trainer')
                ON CONFLICT (phone) DO NOTHING
                """, Map.of("p", TRAINER_PHONE));
        clientId = UUID.randomUUID();
    }

    @Test
    @DisplayName("another trainer's number is accepted — trainer/client duality is allowed")
    void otherTrainersNumberIsAccepted() {
        var result = push(created(TRAINER_PHONE));

        assertThat(exists()).isTrue();
        assertThat(result.rejected()).isEmpty();
        assertThat(phone()).isEqualTo(TRAINER_PHONE);
        // The client identity insert no-ops against the existing trainer one.
        assertThat(role(TRAINER_PHONE)).isEqualTo("trainer");
    }

    @Test
    @DisplayName("the adder's own number is refused, and the row is not created")
    void ownNumberIsRefused() {
        var result = push(created(ADDER_PHONE));

        assertThat(exists()).isFalse();
        assertThat(result.rejected()).singleElement().satisfies(r -> {
            assertThat(r.table()).isEqualTo("clients");
            assertThat(r.id()).isEqualTo(clientId.toString());
            assertThat(r.field()).isEqualTo("phone");
            assertThat(r.code()).isEqualTo(ClientPhoneGuard.CODE_TRAINER);
            assertThat(r.kept()).isFalse();
            assertThat(r.message()).isNotBlank();
        });
    }

    @Test
    @DisplayName("another trainer's client is refused too")
    void otherTrainersClientIsRefused() {
        UUID other = trainer("9100000005");
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status)
                VALUES (gen_random_uuid(), :tid::uuid, 'Meera', :p, 'accepted')
                """, Map.of("tid", other.toString(), "p", TAKEN_PHONE));

        var result = push(created(TAKEN_PHONE));

        assertThat(exists()).isFalse();
        assertThat(result.rejected()).singleElement()
                .satisfies(r -> assertThat(r.code()).isEqualTo(ClientPhoneGuard.CODE_OTHER_ROSTER));
    }

    @Test
    @DisplayName("a duplicate on the adder's OWN roster is refused too")
    void ownDuplicateIsRefused() {
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status)
                VALUES (gen_random_uuid(), :tid::uuid, 'Meera', :p, 'accepted')
                """, Map.of("tid", adder.toString(), "p", TAKEN_PHONE));

        var result = push(created(TAKEN_PHONE));

        assertThat(exists()).isFalse();
        assertThat(result.rejected()).singleElement()
                .satisfies(r -> assertThat(r.code()).isEqualTo(ClientPhoneGuard.CODE_OWN_ROSTER));
    }

    @Test
    @DisplayName("a membership that is over does not block the next trainer")
    void removedMembershipDoesNotBlock() {
        UUID other = trainer("9100000006");
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, status, membership_status)
                VALUES (gen_random_uuid(), :tid::uuid, 'Meera', :p, 'archived', 'removed')
                """, Map.of("tid", other.toString(), "p", TAKEN_PHONE));

        var result = push(created(TAKEN_PHONE));

        assertThat(result.rejected()).isEmpty();
        assertThat(membershipStatus()).isEqualTo("invited");
    }

    @Test
    @DisplayName("editing a live client onto another trainer's number now lands")
    void editOntoOtherTrainersNumberLands() {
        push(created(CLIENT_PHONE));

        var result = push(updated(TRAINER_PHONE, "Meera Pillai"));

        assertThat(name()).isEqualTo("Meera Pillai");
        assertThat(phone()).isEqualTo(TRAINER_PHONE);
        assertThat(result.rejected()).isEmpty();
    }

    @Test
    @DisplayName("editing a live client onto the adder's own number keeps the rest of the edit")
    void editOntoOwnNumberKeepsTheRecord() {
        push(created(CLIENT_PHONE));

        var result = push(updated(ADDER_PHONE, "Meera Pillai"));

        // The name change landed; the number did not move.
        assertThat(name()).isEqualTo("Meera Pillai");
        assertThat(phone()).isEqualTo(CLIENT_PHONE);
        assertThat(result.rejected()).singleElement().satisfies(r -> {
            assertThat(r.code()).isEqualTo(ClientPhoneGuard.CODE_TRAINER);
            assertThat(r.kept()).isTrue();
        });
    }

    @Test
    @DisplayName("re-pushing an unchanged row is never re-judged")
    void unchangedRowIsNotRejudged() {
        push(created(CLIENT_PHONE));
        var result = push(updated(CLIENT_PHONE, "Meera"));

        assertThat(result.rejected()).isEmpty();
        assertThat(phone()).isEqualTo(CLIENT_PHONE);
    }

    @Test
    @DisplayName("a row already saved as `unavailable` still heals when the number is fixed")
    void legacyUnavailableRecovers() {
        // Written the way the old push wrote it, before the rule hardened.
        jdbc.update("""
                INSERT INTO client (id, trainer_id, name, phone, membership_status)
                VALUES (:id::uuid, :tid::uuid, 'Meera', :p, 'unavailable')
                """, Map.of("id", clientId.toString(), "tid", adder.toString(), "p", TRAINER_PHONE));

        var result = push(updated(CLIENT_PHONE, "Meera"));

        assertThat(result.rejected()).isEmpty();
        assertThat(membershipStatus()).isEqualTo("invited");
        assertThat(invitedAt()).isNotNull();
        // The identity is created at the moment the number becomes invitable.
        assertThat(role(CLIENT_PHONE)).isEqualTo("client");
    }

    @Test
    @DisplayName("a normal client is unaffected by any of this")
    void normalClientIsUntouched() {
        var result = push(created(CLIENT_PHONE));

        assertThat(result.rejected()).isEmpty();
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
                "created", List.of(row(phone, "Meera")), "updated", List.of(), "deleted", List.of())));
    }

    private Map<String, Object> updated(String phone, String name) {
        return Map.of("changes", Map.of("clients", Map.of(
                "created", List.of(), "updated", List.of(row(phone, name)), "deleted", List.of())));
    }

    private Map<String, Object> row(String phone, String name) {
        return Map.of("id", clientId.toString(), "name", name,
                "phone", phone, "status", "active");
    }

    private SyncService.PushResult push(Map<String, Object> body) {
        return sync.push(adder, body);
    }

    private boolean exists() {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :id::uuid)",
                Map.of("id", clientId.toString()), Boolean.class));
    }

    private String membershipStatus() {
        return column("membership_status");
    }

    private String name() {
        return column("name");
    }

    private String phone() {
        return column("phone");
    }

    private String column(String col) {
        return jdbc.queryForObject(
                "SELECT %s FROM client WHERE id = :id::uuid".formatted(col),
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
