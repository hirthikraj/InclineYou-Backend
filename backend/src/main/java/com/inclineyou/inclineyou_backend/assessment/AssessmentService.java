package com.inclineyou.inclineyou_backend.assessment;

import com.fasterxml.jackson.core.type.TypeReference;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.*;

import static com.inclineyou.inclineyou_backend.assessment.AssessmentTemplateService.JSON;
import static com.inclineyou.inclineyou_backend.assessment.AssessmentTemplateService.iso;
import static com.inclineyou.inclineyou_backend.assessment.AssessmentTemplateService.str;

/**
 * V14 · an assessment SENT to a client — the trainer's side: the list, the
 * assembled detail, sending, marking read, and deleting.
 *
 * <h2>Status is derived here, and in SQL</h2>
 *
 * {@code done} once completed; else {@code booked} while unsent; else
 * {@code missed} once due, otherwise {@code waiting}. {@code unread} is a fact
 * about a returned assessment only — false in every other state. Both are
 * computed in the list's own query so a filter chip's count and the rows it
 * opens can never disagree, and the app reads them and never works them out.
 *
 * <h2>The detail is joined here, not on the screen</h2>
 *
 * The stored row carries keys and ids — {@code {key:'waist', value:88}},
 * {@code {questionId:'q_sleep', optionIds:['c']}} — which is the right storage
 * and unreadable on its own. The detail resolves each reading against the
 * catalogue and each answer against the template's question (then the bank),
 * DROPPING anything that resolves to neither rather than drawing an id. Its
 * {@code history} is built from this client's RETURNED assessments only —
 * which since V22 is the only place a body reading exists at all.
 */
@Service
@RequiredArgsConstructor
public class AssessmentService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final Set<String> STATUSES = Set.of("booked", "waiting", "missed", "done");
    private static final int MAX_SIZE = 200;
    private static final int MAX_NAME = 120;

    private final NamedParameterJdbcTemplate jdbc;
    private final AssessmentTemplateService templates;

    // ── Wire (timestamps are ISO strings — V14) ───────────────────────────────

    public record Count(int got, int asked) {}

    public record Row(String id, String clientId, String templateId, String name,
                      String dueAt, String sentAt, String completedAt, String readAt,
                      String status, boolean unread, Count measurements, Count questions) {}

    public record Page(List<Row> items, int total) {}

    public record ClientRef(String id, String name, String status) {}

    public record TemplateRef(String id, String name, String description) {}

    public record Asked(List<AssessmentCatalogue.Measurement> measurements,
                        List<AssessmentCatalogue.Question> questions) {}

    public record Reading(String key, String label, String group, String unit, String metric, double value) {}

    public record Answer(String questionId, String text, String kind, Integer scale,
                         List<AssessmentCatalogue.Option> options, boolean allowMultiple,
                         Boolean yes, Integer rating, String answer, List<String> optionIds, List<String> chosen) {}

    public record Point(String assessmentId, String at, double value) {}

    public record History(String key, List<Point> points) {}

    public record Returned(String id, String name, String at) {}

    public record Detail(String id, String clientId, String templateId, String name,
                         String dueAt, String sentAt, String completedAt, String readAt,
                         String status, boolean unread, Count measurements, Count questions,
                         ClientRef client, TemplateRef template, Asked asked,
                         List<Reading> readings, List<Answer> answers,
                         List<History> history, List<Returned> returned) {}

    public record Catalog(List<String> groups, List<AssessmentCatalogue.Measurement> measurements,
                          List<AssessmentCatalogue.Question> questions) {}

    /** What is stored for one reading and one answer (the portal writes these, module 11). */
    public record StoredReading(String key, double value) {}

    public record StoredAnswer(String questionId, Boolean yes, Integer rating, String text, List<String> optionIds) {}

    private static final String STATUS_SQL = """
            CASE WHEN a.completed_at IS NOT NULL THEN 'done'
                 WHEN a.sent_at IS NULL THEN 'booked'
                 WHEN a.due_at < now() THEN 'missed'
                 ELSE 'waiting' END""";

    private static final String ROW_COLUMNS = """
            a.id::text, a.client_id::text, a.template_id::text, a.name, a.due_at, a.sent_at,
            a.completed_at, a.read_at, a.measurements_asked, a.questions_asked,
            jsonb_array_length(a.readings) AS readings_got, jsonb_array_length(a.answers) AS answers_got,
            %s AS status""".formatted(STATUS_SQL);

    // ── The catalogue ─────────────────────────────────────────────────────────

    /** The product's, not the trainer's — never emptied for a new account. */
    public Catalog catalog() {
        return new Catalog(AssessmentCatalogue.GROUPS, AssessmentCatalogue.MEASUREMENTS, AssessmentCatalogue.QUESTIONS);
    }

    // ── One, assembled ────────────────────────────────────────────────────────

    public Detail get(UUID trainerId, UUID id) {
        var r = load(trainerId, id);
        var row = toRow(r);
        String clientId = str(r.get("client_id"));

        var clientRows = jdbc.queryForList("SELECT id::text, name, status FROM client WHERE id = :id::uuid",
                Map.of("id", clientId));
        ClientRef client = clientRows.isEmpty() ? null : new ClientRef(str(clientRows.getFirst().get("id")),
                str(clientRows.getFirst().get("name")), str(clientRows.getFirst().get("status")));

        var tpl = row.templateId() == null ? null : templates.find(trainerId, row.templateId());
        TemplateRef template = tpl == null ? null
                : new TemplateRef(str(tpl.get("id")), str(tpl.get("name")), str(tpl.get("description")));
        var measurementBlock = tpl == null ? null : AssessmentTemplateService.readMeasurements(str(tpl.get("measurements")));
        var questionBlock = tpl == null ? null : AssessmentTemplateService.readQuestions(str(tpl.get("questions")));

        // What the template asks for — the whole content of the three states with nothing back yet.
        var askedMeasurements = measurementBlock == null || !measurementBlock.on() ? List.<AssessmentCatalogue.Measurement>of()
                : measurementBlock.keys().stream().map(AssessmentCatalogue.BY_KEY::get).filter(Objects::nonNull).toList();
        var askedQuestions = questionBlock == null || !questionBlock.on() ? List.<AssessmentCatalogue.Question>of()
                : questionBlock.items();

        var readings = new ArrayList<Reading>();
        for (var sr : storedReadings(str(r.get("readings")))) {
            var def = AssessmentCatalogue.BY_KEY.get(sr.key());
            if (def != null) readings.add(new Reading(def.key(), def.label(), def.group(), def.unit(), def.metric(), sr.value()));
        }

        // The question as it was asked: the template's first, the bank's second, else dropped.
        var byId = new HashMap<String, AssessmentCatalogue.Question>();
        if (questionBlock != null) questionBlock.items().forEach(qq -> byId.put(qq.id(), qq));
        var answers = new ArrayList<Answer>();
        for (var a : storedAnswers(str(r.get("answers")))) {
            var qq = byId.getOrDefault(a.questionId(), AssessmentCatalogue.BANK.get(a.questionId()));
            if (qq == null) continue;
            var ids = a.optionIds() == null ? List.<String>of() : a.optionIds();
            answers.add(new Answer(qq.id(), qq.text(), qq.kind(), qq.scale(), qq.options(), qq.allowMultiple(),
                    a.yes(), a.rating(), a.text(), ids,
                    qq.options().stream().filter(o -> ids.contains(o.id())).map(AssessmentCatalogue.Option::text).toList()));
        }

        // Every assessment this client has had BACK from this trainer, oldest first by when it came back.
        var returnedRows = jdbc.queryForList("""
                SELECT id::text, name, completed_at, readings::text AS readings FROM assessment
                WHERE client_id = :cid::uuid AND trainer_id = :tid::uuid
                  AND deleted_at IS NULL AND completed_at IS NOT NULL
                ORDER BY completed_at ASC, id
                """, Map.of("cid", clientId, "tid", trainerId.toString()));
        var history = new ArrayList<History>();
        for (var reading : readings) {
            var points = new ArrayList<Point>();
            for (var rr : returnedRows) {
                storedReadings(str(rr.get("readings"))).stream()
                        .filter(x -> x.key().equals(reading.key())).findFirst()
                        .ifPresent(x -> points.add(new Point(str(rr.get("id")), iso(rr.get("completed_at")), x.value())));
            }
            history.add(new History(reading.key(), points));
        }
        var returned = new ArrayList<Returned>();
        for (int i = returnedRows.size() - 1; i >= 0; i--) {
            var rr = returnedRows.get(i);
            returned.add(new Returned(str(rr.get("id")), str(rr.get("name")), iso(rr.get("completed_at"))));
        }

        return new Detail(row.id(), row.clientId(), row.templateId(), row.name(), row.dueAt(), row.sentAt(),
                row.completedAt(), row.readAt(), row.status(), row.unread(), row.measurements(), row.questions(),
                client, template, new Asked(askedMeasurements, askedQuestions), readings, answers, history, returned);
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    /**
     * Book or send one. {@code sendNow: false} books it (on the board, the client
     * has no idea); anything else sends it now. The asked counts are frozen from
     * the template at the moment it is SENT.
     */
    @Transactional
    public Row create(UUID trainerId, Map<String, Object> body) {
        var b = body == null ? Map.<String, Object>of() : body;
        String clientId = ownedClient(trainerId, b.get("clientId"));
        var tpl = b.get("templateId") instanceof String t ? templates.find(trainerId, t) : null;
        if (tpl == null) throw AssessmentRuleException.validation("templateId: no such assessment");

        Instant now = Instant.now();
        Instant dueAt = b.containsKey("dueAt") && b.get("dueAt") != null ? instant(b.get("dueAt"), "dueAt") : now;
        boolean send = !Boolean.FALSE.equals(b.get("sendNow"));
        String name = b.get("name") instanceof String n && !n.isBlank() ? n.strip() : str(tpl.get("name"));
        if (name.length() > MAX_NAME) throw AssessmentRuleException.validation("name: at most " + MAX_NAME + " characters");
        var asked = askedCounts(tpl);

        UUID id = UUID.randomUUID();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("cid", clientId);
        p.put("tid", trainerId.toString());
        p.put("tpl", str(tpl.get("id")));
        p.put("name", name);
        p.put("due", Timestamp.from(dueAt));
        p.put("sent", send ? Timestamp.from(now) : null);
        p.put("m", asked[0]);
        p.put("q", asked[1]);
        p.put("now", Timestamp.from(now));
        jdbc.update("""
                INSERT INTO assessment (id, client_id, trainer_id, template_id, name, due_at, sent_at,
                    measurements_asked, questions_asked, created_at, updated_at)
                VALUES (:id::uuid, :cid::uuid, :tid::uuid, :tpl::uuid, :name, :due, :sent, :m, :q, :now, :now)
                """, p);
        return toRow(load(trainerId, id));
    }

    /**
     * {@code read: true|false} — false genuinely un-reads, which is how a trainer
     * parks one opened by accident. {@code dueAt} moves it. {@code send: true}
     * sends a booked one (and re-freezes its counts from the template as it now
     * stands); on one already sent it does nothing.
     */
    @Transactional
    public Row patch(UUID trainerId, UUID id, Map<String, Object> body) {
        var r = load(trainerId, id);
        if (body == null || body.isEmpty()) return toRow(r);
        var sets = new ArrayList<String>();
        var p = new HashMap<String, Object>();
        p.put("id", id.toString());
        p.put("tid", trainerId.toString());
        if (body.containsKey("read")) {
            if (Boolean.FALSE.equals(body.get("read"))) sets.add("read_at = NULL");
            else sets.add("read_at = now()");
        }
        if (body.get("dueAt") != null) {
            p.put("due", Timestamp.from(instant(body.get("dueAt"), "dueAt")));
            sets.add("due_at = :due");
        }
        if (Boolean.TRUE.equals(body.get("send")) && r.get("sent_at") == null) {
            sets.add("sent_at = now()");
            var tpl = r.get("template_id") == null ? null : templates.find(trainerId, str(r.get("template_id")));
            if (tpl != null) {
                var asked = askedCounts(tpl);
                p.put("m", asked[0]);
                p.put("q", asked[1]);
                sets.add("measurements_asked = :m");
                sets.add("questions_asked = :q");
            }
        }
        if (!sets.isEmpty()) {
            sets.add("updated_at = now()");
            jdbc.update("UPDATE assessment a SET " + String.join(", ", sets)
                    + " WHERE a.id = :id::uuid AND a.trainer_id = :tid::uuid AND a.deleted_at IS NULL", p);
        }
        return toRow(load(trainerId, id));
    }

    /** Soft: it may hold answers a client wrote. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        load(trainerId, id);
        jdbc.update("""
                UPDATE assessment SET deleted_at = now(), updated_at = now()
                WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL
                """, Map.of("id", id.toString(), "tid", trainerId.toString()));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Map<String, Object> load(UUID trainerId, UUID id) {
        var rows = jdbc.queryForList("SELECT " + ROW_COLUMNS + ", a.readings::text AS readings, a.answers::text AS answers"
                        + " FROM assessment a WHERE a.id = :id::uuid AND a.trainer_id = :tid::uuid AND a.deleted_at IS NULL",
                Map.of("id", id.toString(), "tid", trainerId.toString()));
        if (rows.isEmpty()) throw AssessmentRuleException.assessmentNotFound();
        return rows.getFirst();
    }

    private String ownedClient(UUID trainerId, Object raw) {
        String id = raw instanceof String s ? s.strip() : null;
        try {
            if (id != null) id = UUID.fromString(id).toString();
        } catch (IllegalArgumentException e) {
            id = null;
        }
        Boolean owned = id != null && Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM client WHERE id = :id::uuid AND trainer_id = :tid::uuid AND deleted_at IS NULL)",
                Map.of("id", id, "tid", trainerId.toString()), Boolean.class));
        if (!owned) throw AssessmentRuleException.validation("clientId: no such client");
        return id;
    }

    /** [measurements asked, questions asked], from the template as it stands. */
    private static int[] askedCounts(Map<String, Object> tpl) {
        var m = AssessmentTemplateService.readMeasurements(str(tpl.get("measurements")));
        var q = AssessmentTemplateService.readQuestions(str(tpl.get("questions")));
        return new int[]{m.on() ? m.keys().size() : 0, q.on() ? q.items().size() : 0};
    }

    /** An ISO instant, an ISO date-time with an offset, or a bare date (read as IST midnight). */
    private static Instant instant(Object raw, String field) {
        if (raw instanceof String s && !s.isBlank()) {
            String v = s.strip();
            try { return Instant.parse(v); } catch (Exception ignored) { /* next shape */ }
            try { return OffsetDateTime.parse(v).toInstant(); } catch (Exception ignored) { /* next shape */ }
            try { return LocalDate.parse(v).atStartOfDay(IST).toInstant(); } catch (Exception ignored) { /* refused */ }
        }
        throw AssessmentRuleException.validation(field + ": must be an ISO date-time");
    }

    private static List<StoredReading> storedReadings(String json) {
        try {
            return JSON.readValue(Objects.requireNonNullElse(json, "[]"), new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private static List<StoredAnswer> storedAnswers(String json) {
        try {
            return JSON.readValue(Objects.requireNonNullElse(json, "[]"), new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private static Row toRow(Map<String, Object> r) {
        String status = str(r.get("status"));
        return new Row(str(r.get("id")), str(r.get("client_id")), str(r.get("template_id")), str(r.get("name")),
                iso(r.get("due_at")), iso(r.get("sent_at")), iso(r.get("completed_at")), iso(r.get("read_at")),
                status, "done".equals(status) && r.get("read_at") == null,
                new Count(num(r.get("readings_got")), num(r.get("measurements_asked"))),
                new Count(num(r.get("answers_got")), num(r.get("questions_asked"))));
    }

    private static int num(Object v) { return v instanceof Number n ? n.intValue() : 0; }
}
