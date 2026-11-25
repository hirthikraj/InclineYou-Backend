package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ArchiveRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateClientRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.CreateLeadContactRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.UpdateClientRequest;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantScope;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * V48 — following up a prospect: the four lead fields on the client, the contact log that moves the follow-up date, its
 * Undo, erasure, and the owner's call that none of it waits for consent.
 */
@SpringBootTest
@Transactional
class LeadTrackingTest {

    @Autowired NamedParameterJdbcTemplate jdbc;
    @Autowired ClientWriteService writes;
    @Autowired ClientSummaryService summaries;
    @Autowired ClientStateService states;
    @Autowired LeadContactService contacts;
    @Autowired ClientJdbcRepository clients;

    private UUID trainer;
    private UUID pack;
    /* Asia/Kolkata, the default workspace zone; a test run just past UTC midnight must not see "tomorrow" as today. */
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

    @BeforeEach
    void setUp() {
        trainer = trainer("9100000481");
        UUID tenant = UUID.fromString(jdbc.queryForObject("SELECT home_tenant_id::text FROM trainer WHERE id = :id::uuid",
                Map.of("id", trainer.toString()), String.class));
        CurrentScope.set(new TenantScope.Scope(null, trainer, tenant, List.of(), false));
        pack = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency)
                VALUES (:id::uuid, :t::uuid, 'Twelve', 'floor', 'sessions', 12, 9000, 'INR')""",
                Map.of("id", pack.toString(), "t", trainer.toString()));
    }

    @AfterEach
    void tearDown() {
        CurrentScope.clear();
    }

    @Test
    @DisplayName("a prospect is added with where they came from, what they asked about and when to follow up")
    void createWithLead() {
        UUID id = prospect("Ritu", "+919100000482");
        var lead = summaries.one(trainer, id).orElseThrow().lead();
        assertEquals("instagram", lead.source());
        assertEquals("saw the reel", lead.sourceDetail());
        assertEquals(pack.toString(), lead.interestedPackId());
        assertEquals("Twelve", lead.interestedPackName());
        assertEquals(today.plusDays(2).toString(), lead.nextFollowUpOn());
        assertNull(lead.lastContactAt());
    }

    @Test
    @DisplayName("another trainer's pack, a date in the past and one more than a year out are 400 VALIDATION")
    void createRefusals() {
        UUID other = trainer("9100000483");
        UUID theirs = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pack (id, trainer_id, name, service, basis, sessions, amount, currency)
                VALUES (:id::uuid, :t::uuid, 'Theirs', 'floor', 'sessions', 8, 6000, 'INR')""",
                Map.of("id", theirs.toString(), "t", other.toString()));
        assertEquals("VALIDATION", code(() -> writes.create(trainer, create("A", null, theirs, today))));
        assertEquals("VALIDATION", code(() -> writes.create(trainer, create("B", null, null, today.minusDays(1)))));
        assertEquals("VALIDATION", code(() -> writes.create(trainer, create("C", null, null, today.plusDays(400)))));
    }

    @Test
    @DisplayName("the lead fields are edited and cleared without consent")
    void patchWithoutConsent() {
        UUID id = prospect("Ritu", "+919100000484");
        writes.patch(trainer, id, patch(Patch.of("referral"), Patch.of("Kavya's sister"), Patch.of(null), Patch.of(today)), null);
        var lead = summaries.one(trainer, id).orElseThrow().lead();
        assertEquals("referral", lead.source());
        assertEquals("Kavya's sister", lead.sourceDetail());
        assertNull(lead.interestedPackId());
        assertEquals(today.toString(), lead.nextFollowUpOn());
    }

    @Test
    @DisplayName("a contact before consent moves the follow-up date; a replayed id answers it again; a closing outcome clears it")
    void contactLog() {
        UUID id = prospect("Ritu", "+919100000485");
        UUID first = UUID.randomUUID();
        var saved = contacts.create(trainer, id, new CreateLeadContactRequest(first, "call", "call_back", " Busy this week ", today.plusDays(7)));
        assertTrue(saved.created());
        assertEquals("Busy this week", saved.contact().note());
        assertEquals(today.plusDays(7).toString(), saved.nextFollowUpOn());

        var replay = contacts.create(trainer, id, new CreateLeadContactRequest(first, "call", "call_back", "Busy this week", today.plusDays(7)));
        assertFalse(replay.created());
        assertEquals(1, contacts.list(trainer, id).size());

        assertEquals("VALIDATION", code(() -> contacts.create(trainer, id,
                new CreateLeadContactRequest(null, "whatsapp", "not_interested", null, today.plusDays(3)))));

        contacts.create(trainer, id, new CreateLeadContactRequest(null, "whatsapp", "too_expensive", "Wants under 6k", null));
        var lead = summaries.one(trainer, id).orElseThrow().lead();
        assertNull(lead.nextFollowUpOn(), "a closing outcome ends the follow-ups");
        assertEquals("too_expensive", lead.lastOutcome());
        assertEquals("too_expensive", contacts.list(trainer, id).get(0).outcome(), "newest first");
    }

    @Test
    @DisplayName("Undo of the newest contact puts the follow-up date back; Undo of an older one, or after a later change, does not")
    void undo() {
        UUID id = prospect("Ritu", "+919100000486");      // follow-up: today + 2
        var a = contacts.create(trainer, id, new CreateLeadContactRequest(null, "call", "no_answer", null, today.plusDays(1)));
        var b = contacts.create(trainer, id, new CreateLeadContactRequest(null, "call", "interested", null, today.plusDays(5)));

        contacts.delete(trainer, id, UUID.fromString(a.contact().id()));
        assertEquals(today.plusDays(5).toString(), followUp(id), "an older contact's Undo leaves the newer date");

        contacts.delete(trainer, id, UUID.fromString(b.contact().id()));
        assertEquals(today.plusDays(1).toString(), followUp(id), "the newest contact's Undo restores what it replaced");
        contacts.delete(trainer, id, UUID.fromString(b.contact().id()));   // idempotent
        assertEquals(0, contacts.list(trainer, id).size());

        var c = contacts.create(trainer, id, new CreateLeadContactRequest(null, "in_person", "wants_trial", null, today.plusDays(3)));
        writes.patch(trainer, id, patch(null, null, null, Patch.of(today.plusDays(9))), null);
        contacts.delete(trainer, id, UUID.fromString(c.contact().id()));
        assertEquals(today.plusDays(9).toString(), followUp(id), "a date changed by hand since is the trainer's newer word");
    }

    @Test
    @DisplayName("erasing a client deletes the contacts and scrubs the lead fields; the source stays on the tombstone")
    void erase() {
        UUID id = prospect("Ritu", "+919100000487");
        contacts.create(trainer, id, new CreateLeadContactRequest(null, "call", "interested", "Mornings only", today.plusDays(1)));
        jdbc.queryForObject("SELECT erase_clients(ARRAY[CAST(:c AS uuid)], 'trainer')::text", Map.of("c", id.toString()), String.class);
        var row = jdbc.queryForMap("SELECT lead_source, lead_source_detail, interested_pack_id, next_follow_up_on FROM client WHERE id = :c::uuid",
                Map.of("c", id.toString()));
        assertEquals("instagram", row.get("lead_source"));
        assertNull(row.get("lead_source_detail"));
        assertNull(row.get("interested_pack_id"));
        assertNull(row.get("next_follow_up_on"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM lead_contact WHERE client_id = :c::uuid",
                Map.of("c", id.toString()), Integer.class));
    }

    @Test
    @DisplayName("a prospect who never went ahead is archived as not_interested or no_response")
    void archiveReasons() {
        UUID id = prospect("Ritu", "+919100000488");
        states.archive(trainer, id, new ArchiveRequest("no_response", null));
        assertEquals("no_response", summaries.one(trainer, id).orElseThrow().archiveReason());
    }

    @Test
    @DisplayName("a join-link approval stamps the source and the pack, without overwriting a trainer's own answer")
    void joinStamp() {
        UUID id = prospect("Ritu", "+919100000489");          // instagram, Twelve
        clients.stampJoinLead(id, null);
        assertEquals("instagram", summaries.one(trainer, id).orElseThrow().lead().source());

        UUID bare = UUID.randomUUID();
        writes.create(trainer, new CreateClientRequest(bare, "Asha", "+919100000490", null, "independent", "prospect", null, null,
                null, null, null, null));
        clients.stampJoinLead(bare, pack);
        var lead = summaries.one(trainer, bare).orElseThrow().lead();
        assertEquals("join_link", lead.source());
        assertEquals(pack.toString(), lead.interestedPackId());
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private UUID prospect(String name, String phone) {
        UUID id = UUID.randomUUID();
        writes.create(trainer, new CreateClientRequest(id, name, phone, null, "independent", "prospect", null, null,
                "instagram", "saw the reel", pack, today.plusDays(2)));
        return id;
    }

    private static CreateClientRequest create(String name, String source, UUID pack, LocalDate followUp) {
        return new CreateClientRequest(null, name, null, null, "independent", "prospect", null, null, source, null, pack, followUp);
    }

    private static UpdateClientRequest patch(Patch<String> source, Patch<String> detail, Patch<UUID> pack, Patch<LocalDate> followUp) {
        return new UpdateClientRequest(null, null, null, null, null, null, null, null, null, null, null, source, detail, pack, followUp);
    }

    private String followUp(UUID id) {
        return summaries.one(trainer, id).orElseThrow().lead().nextFollowUpOn();
    }

    private static String code(Runnable r) {
        return assertThrows(ApiException.class, r::run).getCode();
    }

    private UUID trainer(String phone) {
        String e164 = "+91" + phone;
        jdbc.update("INSERT INTO app_user (id, phone, role) VALUES (gen_random_uuid(), :phone, 'trainer') ON CONFLICT (phone) DO NOTHING",
                Map.of("phone", e164));
        String appUserId = jdbc.queryForObject("SELECT id::text FROM app_user WHERE phone = :phone", Map.of("phone", e164), String.class);
        jdbc.update("INSERT INTO trainer (id, app_user_id, name) VALUES (gen_random_uuid(), :a::uuid, :p) ON CONFLICT (app_user_id) DO NOTHING",
                Map.of("a", appUserId, "p", phone));
        return UUID.fromString(jdbc.queryForObject("SELECT id::text FROM trainer WHERE app_user_id = :a::uuid",
                Map.of("a", appUserId), String.class));
    }
}
