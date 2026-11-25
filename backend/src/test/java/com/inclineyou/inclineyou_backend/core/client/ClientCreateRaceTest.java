package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * {@code POST /v1/clients} when another request wins the race between the checks and the INSERT (18 Nov 2026). Without
 * threads: the check that would have seen the winner is made to miss, and the INSERT then meets it. A double tap with
 * one id answers the first client (200, not 409); two adds of one number answer the number's own refusal (not a 500 —
 * the INSERT used to throw, abort the transaction, and take the follow-up phone check down with it).
 */
@SpringBootTest
@Transactional
class ClientCreateRaceTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired ClientWriteService writes;
    @MockitoSpyBean ClientJdbcRepository clients;
    @MockitoSpyBean ClientPhoneGuard guard;
    @MockitoSpyBean ClientNoteJdbcRepository noteRepo;
    @Autowired ClientNoteService notes;

    private UUID trainer;

    @BeforeEach
    void setUp() {
        String phone = "+919100000131";
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :p, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("p", phone));
        jdbc.update("""
                INSERT INTO trainer (id, app_user_id, name)
                SELECT gen_random_uuid(), id, 'T' FROM app_user WHERE phone = :p ON CONFLICT (app_user_id) DO NOTHING
                """, Map.of("p", phone));
        trainer = UUID.fromString(jdbc.queryForObject(
                "SELECT t.id::text FROM trainer t JOIN app_user a ON a.id = t.app_user_id WHERE a.phone = :p",
                Map.of("p", phone), String.class));
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("a double tap: the replay lookup misses the first request's row, the INSERT meets it, and the answer is that client (200)")
    void doubleTap() {
        UUID id = UUID.randomUUID();
        var first = writes.create(trainer, request(id, "Meera", "+919876500001"));
        // The second request's checks ran before the first committed: it saw neither the id nor the number.
        Mockito.doReturn(Optional.empty()).doCallRealMethod().when(clients).ownerOf(id);
        Mockito.doReturn(ClientPhoneGuard.Verdict.ok()).doCallRealMethod().when(guard).check(trainer.toString(), "+919876500001");
        var again = writes.create(trainer, request(id, "Meera", "+919876500001"));
        assertFalse(again.created(), "a replay, not a second client");
        assertEquals(first.client().id(), again.client().id());
    }

    @Test
    @DisplayName("two adds of one number: the phone check misses the winner, the INSERT meets it, and the answer is the number's refusal (not a 500)")
    void sameNumber() {
        writes.create(trainer, request(UUID.randomUUID(), "Meera", "+919876500002"));
        // The second add's phone check ran before the first committed: the number looked free.
        Mockito.doReturn(ClientPhoneGuard.Verdict.ok()).doCallRealMethod().when(guard).check(trainer.toString(), "+919876500002");
        var refused = assertThrows(PhoneUnavailableException.class,
                () -> writes.create(trainer, request(UUID.randomUUID(), "Arjun", "+919876500002")));
        assertEquals(ClientPhoneGuard.CODE_OWN_ROSTER, refused.getCode());
    }

    @Test
    @DisplayName("an edit racing another write for one number answers the number's refusal (not a 500): the savepoint keeps the transaction usable")
    void editRace() {
        writes.create(trainer, request(UUID.randomUUID(), "Meera", "+919876500003"));
        var arjun = writes.create(trainer, request(UUID.randomUUID(), "Arjun", "+919876500004")).client();
        Mockito.doReturn(ClientPhoneGuard.Verdict.ok()).doCallRealMethod().when(guard).check(trainer.toString(), "+919876500003");
        var refused = assertThrows(PhoneUnavailableException.class, () -> writes.patch(trainer, UUID.fromString(arjun.id()),
                edit(Patch.of("+919876500003"), null), null));
        assertEquals(ClientPhoneGuard.CODE_OWN_ROSTER, refused.getCode());
        // The transaction is still usable: the next write in it works.
        assertEquals("Arjun K", writes.patch(trainer, UUID.fromString(arjun.id()), edit(null, null, Patch.of("Arjun K")), null).name());
    }

    @Test
    @DisplayName("a client's type cannot switch while a pack is running or owed; with none it can")
    void typeSwitch() {
        var meera = writes.create(trainer, request(UUID.randomUUID(), "Meera", "+919876500005")).client();
        UUID id = UUID.fromString(meera.id());
        assertEquals("gym", writes.patch(trainer, id, edit(null, Patch.of("gym")), null).clientType(), "no packs: allowed");
        writes.patch(trainer, id, edit(null, Patch.of("independent")), null);

        jdbc.update("""
                INSERT INTO package (id, trainer_id, client_id, name, service, basis, sessions_total, sessions_remaining,
                                     amount, currency, start_date)
                VALUES (gen_random_uuid(), :t::uuid, :c::uuid, '12 sessions', 'floor', 'sessions', 12, 12, 9000, 'INR', current_date)
                """, Map.of("t", trainer.toString(), "c", id.toString()));
        var refused = assertThrows(com.inclineyou.inclineyou_backend.shared.exception.ApiException.class,
                () -> writes.patch(trainer, id, edit(null, Patch.of("gym")), null));
        assertEquals("CLIENT_HAS_PACKAGES", refused.getCode());
        assertEquals("independent", writes.patch(trainer, id, edit(null, Patch.of("independent")), null).clientType(),
                "re-sending the same type is not a switch");
    }

    @Test
    @DisplayName("a note double-tapped with one id: the replay lookup misses the first, the INSERT skips, and the answer is that note (200)")
    void noteDoubleTap() {
        var meera = writes.create(trainer, request(UUID.randomUUID(), "Meera", "+919876500006")).client();
        UUID cid = UUID.fromString(meera.id()), id = UUID.randomUUID();
        // Notes wait for consent (22 Nov 2026).
        jdbc.update("UPDATE client SET membership_status = 'accepted', invited_at = now(), accepted_at = now() WHERE id = :c::uuid",
                java.util.Map.of("c", cid.toString()));
        var note = new com.inclineyou.inclineyou_backend.core.client.dto.CreateNoteRequest(id, "Knee felt better today", false, false);
        var first = notes.create(trainer, cid, note);
        Mockito.doReturn(Optional.empty()).doCallRealMethod().when(noteRepo).isMine(id, trainer, cid);
        var again = notes.create(trainer, cid, note);
        assertFalse(again.created(), "a replay, not 409");
        assertEquals(first.note().id(), again.note().id());
    }

    private static UpdateClientRequest edit(Patch<String> phone, Patch<String> type) {
        return edit(phone, type, null);
    }

    private static UpdateClientRequest edit(Patch<String> phone, Patch<String> type, Patch<String> name) {
        return new UpdateClientRequest(name, phone, null, type, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static CreateClientRequest request(UUID id, String name, String phone) {
        return new CreateClientRequest(id, name, phone, null, "independent", null, null, null, null, null, null, null);
    }
}
