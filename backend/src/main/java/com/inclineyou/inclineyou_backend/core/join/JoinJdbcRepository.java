package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.join.dto.JoinQuestion;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinRequestItem;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Array;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The join link and its requests (V45). The trainer's side reads and writes its own rows under row-level security, always
 * naming the active workspace; the public page goes only through the definer functions ({@code join_card},
 * {@code submit_join_request}), and approval only through {@code approve_join_request}.
 */
@Repository
@RequiredArgsConstructor
public class JoinJdbcRepository {

    static final JsonMapper JSON = JsonMapper.builder().build();

    private final NamedParameterJdbcTemplate jdbc;

    // ── the link ─────────────────────────────────────────────────────────────

    public record Link(UUID id, String slug, boolean takingJoins, String welcomeLine, List<JoinQuestion> questions,
                       List<UUID> packIds, boolean allowNoPlan, String welcomeMessage, UUID checkInTemplateId, long updatedAt) {}

    public Optional<Link> link(UUID trainerId, UUID tenantId) {
        return jdbc.query("""
                SELECT id, slug, taking_joins, welcome_line, questions::text AS questions, pack_ids, allow_no_plan,
                       welcome_message, check_in_template_id, updated_at
                  FROM join_link WHERE trainer_id = :tid::uuid AND tenant_id = :ten::uuid
                """, Map.of("tid", trainerId.toString(), "ten", tenantId.toString()), (rs, i) -> link(rs)).stream().findFirst();
    }

    /** Whether another link already has this slug. */
    public boolean slugTaken(String slug, UUID trainerId, UUID tenantId) {
        Boolean taken = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM join_link WHERE slug = :s AND NOT (trainer_id = :tid::uuid AND tenant_id = :ten::uuid))
                """, Map.of("s", slug, "tid", trainerId.toString(), "ten", tenantId.toString()), Boolean.class);
        return Boolean.TRUE.equals(taken);
    }

    /** Insert or replace the whole row. */
    public void save(UUID trainerId, UUID tenantId, String slug, boolean takingJoins, String welcomeLine,
                     List<JoinQuestion> questions, List<UUID> packIds, boolean allowNoPlan, String welcomeMessage,
                     UUID checkInTemplateId) {
        var p = new HashMap<String, Object>();
        p.put("tid", trainerId.toString());
        p.put("ten", tenantId.toString());
        p.put("slug", slug);
        p.put("on", takingJoins);
        p.put("line", welcomeLine);
        p.put("q", JSON.writeValueAsString(questions));
        p.put("packs", packIds.stream().map(UUID::toString).toArray(String[]::new));
        p.put("nop", allowNoPlan);
        p.put("msg", welcomeMessage);
        p.put("tpl", checkInTemplateId == null ? null : checkInTemplateId.toString());
        jdbc.update("""
                INSERT INTO join_link (trainer_id, tenant_id, slug, taking_joins, welcome_line, questions, pack_ids, allow_no_plan,
                                       welcome_message, check_in_template_id)
                VALUES (:tid::uuid, :ten::uuid, :slug, :on, :line, :q::jsonb, :packs::uuid[], :nop, :msg, :tpl::uuid)
                ON CONFLICT (tenant_id, trainer_id) DO UPDATE
                   SET slug = EXCLUDED.slug, taking_joins = EXCLUDED.taking_joins, welcome_line = EXCLUDED.welcome_line,
                       questions = EXCLUDED.questions, pack_ids = EXCLUDED.pack_ids, allow_no_plan = EXCLUDED.allow_no_plan,
                       welcome_message = EXCLUDED.welcome_message, check_in_template_id = EXCLUDED.check_in_template_id
                """, p);
    }

    /** Of these ids, the ones that are this trainer's live packs in this workspace. */
    public List<UUID> ownActivePacks(UUID trainerId, UUID tenantId, List<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbc.queryForList("""
                SELECT id FROM pack WHERE id = ANY (:ids::uuid[]) AND trainer_id = :tid::uuid AND tenant_id = :ten::uuid
                   AND status = 'active' AND deleted_at IS NULL
                """, Map.of("ids", ids.stream().map(UUID::toString).toArray(String[]::new), "tid", trainerId.toString(),
                "ten", tenantId.toString()), UUID.class);
    }

    public boolean ownTemplate(UUID trainerId, UUID templateId) {
        Boolean mine = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM assessment_template WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)
                """, Map.of("id", templateId.toString(), "tid", trainerId.toString()), Boolean.class);
        return Boolean.TRUE.equals(mine);
    }

    public String trainerName(UUID trainerId) {
        return jdbc.queryForObject("SELECT name FROM trainer WHERE id = :tid::uuid", Map.of("tid", trainerId.toString()), String.class);
    }

    /** The business's name — the workspace's own (V46). */
    public String businessName(UUID tenantId) {
        return jdbc.queryForObject("SELECT name FROM tenant WHERE id = :ten::uuid", Map.of("ten", tenantId.toString()), String.class);
    }

    // ── the requests ─────────────────────────────────────────────────────────

    public List<JoinRequestItem> requests(UUID trainerId, UUID tenantId, List<String> states) {
        return jdbc.query("""
                SELECT r.id, r.status, r.name, r.phone, r.email, r.date_of_birth, r.gender, r.answers::text AS answers,
                       r.whatsapp_reminders, r.created_at, r.decided_at, r.client_id,
                       p.id AS pack_id, p.name AS pack_name, p.amount AS pack_amount, p.currency AS pack_currency,
                       (p.id IS NOT NULL AND p.status = 'active' AND p.deleted_at IS NULL) AS pack_offered
                  FROM join_request r LEFT JOIN pack p ON p.id = r.pack_id
                 WHERE r.trainer_id = :tid::uuid AND r.tenant_id = :ten::uuid AND r.status = ANY (:states::varchar[])
                 ORDER BY r.created_at DESC, r.id DESC
                 LIMIT 200
                """, Map.of("tid", trainerId.toString(), "ten", tenantId.toString(), "states", states.toArray(String[]::new)),
                (rs, i) -> item(rs));
    }

    public Optional<JoinRequestItem> request(UUID trainerId, UUID tenantId, UUID id) {
        return jdbc.query("""
                SELECT r.id, r.status, r.name, r.phone, r.email, r.date_of_birth, r.gender, r.answers::text AS answers,
                       r.whatsapp_reminders, r.created_at, r.decided_at, r.client_id,
                       p.id AS pack_id, p.name AS pack_name, p.amount AS pack_amount, p.currency AS pack_currency,
                       (p.id IS NOT NULL AND p.status = 'active' AND p.deleted_at IS NULL) AS pack_offered
                  FROM join_request r LEFT JOIN pack p ON p.id = r.pack_id
                 WHERE r.id = :id::uuid AND r.trainer_id = :tid::uuid AND r.tenant_id = :ten::uuid
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "ten", tenantId.toString()), (rs, i) -> item(rs))
                .stream().findFirst();
    }

    public Map<String, Integer> counts(UUID trainerId, UUID tenantId) {
        var out = new HashMap<String, Integer>();
        jdbc.query("""
                SELECT status, count(*)::int AS n FROM join_request
                 WHERE trainer_id = :tid::uuid AND tenant_id = :ten::uuid GROUP BY status
                """, Map.of("tid", trainerId.toString(), "ten", tenantId.toString()),
                rs -> { out.put(rs.getString("status"), rs.getInt("n")); });
        return out;
    }

    /** The caller's own waiting request from this number in this workspace: what the add flow's phone check offers instead. */
    public record Waiting(UUID id, String name) {}

    public Optional<Waiting> waitingFor(UUID trainerId, UUID tenantId, String phone) {
        return jdbc.query("""
                SELECT id, name FROM join_request
                 WHERE trainer_id = :tid::uuid AND tenant_id = :ten::uuid AND phone = :phone AND status = 'pending'
                """, Map.of("tid", trainerId.toString(), "ten", tenantId.toString(), "phone", phone),
                (rs, i) -> new Waiting(rs.getObject("id", UUID.class), rs.getString("name"))).stream().findFirst();
    }

    /**
     * The trainer added this number by hand, so a request from it can no longer be approved (approval would answer
     * already_client). It is closed as declined rather than left waiting for ever (23 Nov 2026). The count it closed.
     */
    public int closeForAdded(UUID trainerId, UUID tenantId, String phone) {
        return jdbc.update("""
                UPDATE join_request SET status = 'declined', decided_at = now()
                 WHERE trainer_id = :tid::uuid AND tenant_id = :ten::uuid AND phone = :phone AND status = 'pending'
                """, Map.of("tid", trainerId.toString(), "ten", tenantId.toString(), "phone", phone));
    }

    /** A waiting request becomes declined; anything else is left alone. True when this call declined it. */
    public boolean decline(UUID trainerId, UUID tenantId, UUID id) {
        return jdbc.update("""
                UPDATE join_request SET status = 'declined', decided_at = now()
                 WHERE id = :id::uuid AND trainer_id = :tid::uuid AND tenant_id = :ten::uuid AND status = 'pending'
                """, Map.of("id", id.toString(), "tid", trainerId.toString(), "ten", tenantId.toString())) == 1;
    }

    /** {@code approve_join_request()}: its jsonb. */
    public JsonNode approve(UUID id, String clientType) {
        String json = jdbc.queryForObject("SELECT approve_join_request(:id::uuid, :ct)::text",
                Map.of("id", id.toString(), "ct", clientType), String.class);
        return JSON.readTree(json);
    }

    // ── the public page ──────────────────────────────────────────────────────

    public JsonNode card(String slug) {
        return JSON.readTree(jdbc.queryForObject("SELECT join_card(:s)::text", Map.of("s", slug), String.class));
    }

    /** {@code submit_join_request()}; must run with the proved number as {@code app.phone}. Answers its {@code result}. */
    public String submit(String slug, String name, String phone, String email, java.time.LocalDate dob, String gender, UUID packId,
                         String answersJson, String policyVersion, boolean whatsappReminders) {
        var p = new HashMap<String, Object>();
        p.put("s", slug);
        p.put("n", name);
        p.put("ph", phone);
        p.put("e", email);
        p.put("dob", Date.valueOf(dob));
        p.put("g", gender);
        p.put("pk", packId == null ? null : packId.toString());
        p.put("a", answersJson);
        p.put("pv", policyVersion);
        p.put("wa", whatsappReminders);
        String json = jdbc.queryForObject("""
                SELECT submit_join_request(:s, :n, :ph, :e, :dob, :g, :pk::uuid, :a::jsonb, :pv, :wa, true)::text
                """, p, String.class);
        return JSON.readTree(json).path("result").asString();
    }

    /** {@code purge_join_requests()}; SYSTEM only. */
    public int purge() {
        Integer n = jdbc.queryForObject("SELECT purge_join_requests()", Map.of(), Integer.class);
        return n == null ? 0 : n;
    }

    // ── mapping ──────────────────────────────────────────────────────────────

    private static Link link(ResultSet rs) throws SQLException {
        Array packs = rs.getArray("pack_ids");
        var ids = new ArrayList<UUID>();
        if (packs != null) for (Object o : (Object[]) packs.getArray()) ids.add((UUID) o);
        return new Link(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getBoolean("taking_joins"),
                rs.getString("welcome_line"), questions(rs.getString("questions")), ids, rs.getBoolean("allow_no_plan"),
                rs.getString("welcome_message"), rs.getObject("check_in_template_id", UUID.class),
                rs.getTimestamp("updated_at").toInstant().toEpochMilli());
    }

    /**
     * The stored questions in today's shape. A question saved before 22 Nov 2026 was {@code {label, kind: text|choice,
     * options: [string]}}; it is read as the assessment-shaped one ({@code text}, options with ids) so nothing downstream
     * has to know there were two.
     */
    static List<JoinQuestion> questions(String json) {
        if (json == null || json.isBlank()) return List.of();
        var out = new ArrayList<JoinQuestion>();
        for (JsonNode q : JSON.readTree(json)) {
            String text = q.path("text").isString() ? q.path("text").asString() : q.path("label").asString("");
            var options = new ArrayList<JoinQuestion.Option>();
            int i = 0;
            for (JsonNode o : q.path("options")) {
                if (o.isString()) options.add(new JoinQuestion.Option(q.path("id").asString("q") + "_o" + i, o.asString()));
                else options.add(new JoinQuestion.Option(o.path("id").asString(), o.path("text").asString("")));
                i++;
            }
            out.add(new JoinQuestion(q.path("id").asString(), text, q.path("kind").asString("text"),
                    q.path("scale").isNumber() ? q.path("scale").asInt() : null, options,
                    q.path("allowMultiple").asBoolean(false), q.path("allowCustom").asBoolean(false),
                    q.path("required").asBoolean(false)));
        }
        return out;
    }

    private static JoinRequestItem item(ResultSet rs) throws SQLException {
        var answers = new ArrayList<JoinRequestItem.Answer>();
        for (JsonNode a : JSON.readTree(rs.getString("answers"))) {
            answers.add(new JoinRequestItem.Answer(a.path("label").asString(), a.path("answer").isString() ? a.path("answer").asString() : null));
        }
        UUID packId = rs.getObject("pack_id", UUID.class);
        var plan = packId == null ? null : new JoinRequestItem.Plan(packId, rs.getString("pack_name"),
                rs.getBigDecimal("pack_amount").toPlainString(), rs.getString("pack_currency"), rs.getBoolean("pack_offered"));
        Date dob = rs.getDate("date_of_birth");
        Timestamp decided = rs.getTimestamp("decided_at");
        return new JoinRequestItem(rs.getObject("id", UUID.class), rs.getString("status"), rs.getString("name"),
                rs.getString("phone"), rs.getString("email"), dob == null ? null : dob.toLocalDate().toString(),
                rs.getString("gender"), plan, answers, rs.getBoolean("whatsapp_reminders"),
                rs.getTimestamp("created_at").toInstant().toEpochMilli(),
                decided == null ? null : decided.toInstant().toEpochMilli(), rs.getObject("client_id", UUID.class));
    }
}
