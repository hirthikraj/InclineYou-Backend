package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import com.inclineyou.inclineyou_backend.core.assessment.dto.PortalAssessment;
import com.inclineyou.inclineyou_backend.core.portal.PortalAccess;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.Cursor;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The client's assessments tab (api-contract 1.2, pa-l1 … pa-a2): what is waiting and what is done, one assessment to take or to read back,
 * the templates the trainer offers, and the entry.
 *
 * <p><b>The same concept, the same form, the same checks.</b> An assessment's form is its own copy, so it opens even if the trainer later edits
 * or deletes the template; an entry is validated by the trainer's own rules ({@link AssessmentEntryService}); and a submit moves the cycle on
 * by the same steps the trainer's path takes — from the day it was DONE, in the trainer's calendar — through the two V24 doors a client's
 * connection needs for it. A submitted assessment is final for the client: a correction is the trainer's.
 *
 * <p><b>A body is measured here and nowhere else.</b> With {@code hideWeight} on, {@code weight} is dropped from the form, the readings and
 * the history and cannot be entered; nothing else about the assessment changes.
 */
@Service
@RequiredArgsConstructor
public class PortalAssessmentService {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String HEALTH_NOTICE = "Your trainer asked this. It is stored with your assessment and they can see it.";

    private final PortalAssessmentJdbcRepository repo;
    private final AssessmentJdbcRepository assessments;
    private final AssessmentTemplateJdbcRepository templates;
    private final PortalAccess access;

    // ── the list ─────────────────────────────────────────────────────────────────────────────────

    public PortalAssessment.Page list(String phone, String state, int limit, String rawCursor, boolean counts) {
        UUID client = access.clientId(phone);
        if (!"open".equals(state) && !"done".equals(state)) throw ApiException.validation("state: open or done");
        boolean open = "open".equals(state);
        int n = Math.max(1, Math.min(limit, 50));
        var cursor = Cursor.decode(rawCursor);
        LocalDate afterDue = null;
        if (cursor != null && open) {
            try {
                afterDue = LocalDate.parse(cursor.key());
            } catch (Exception e) {
                throw ApiException.validation("cursor: not a cursor from this list");
            }
        }
        LocalDate today = LocalDate.now(ZoneId.of(repo.zoneOf(client)));
        var rows = repo.list(client, open, today, afterDue, cursor == null || open ? null : cursor.keyAsTimestamp(), cursor == null ? null : cursor.id(), n + 1);
        boolean more = rows.size() > n;
        var page = more ? rows.subList(0, n) : rows;
        String next = null;
        if (more) {
            var last = page.getLast();
            next = Cursor.encode(open ? last.item().dueOn() : Cursor.key(last.key()), last.item().id());
        }
        return new PortalAssessment.Page(page.stream().map(PortalAssessmentJdbcRepository.ListRow::item).toList(), counts ? repo.counts(client) : null,
                repo.canStart(client), next);
    }

    // ── one ──────────────────────────────────────────────────────────────────────────────────────

    public PortalAssessment.Detail get(String phone, UUID id) {
        UUID client = access.clientId(phone);
        return detail(client, assessments.findForClient(client, id, false).orElseThrow(PortalAssessmentService::notFound));
    }

    private PortalAssessment.Detail detail(UUID client, AssessmentRow row) {
        boolean hideWeight = repo.hideWeight(client);
        var form = AssessmentForms.read(row.form());
        var measurements = form.measurements().stream().filter(m -> !(hideWeight && "weight".equals(m.key()))).toList();
        boolean health = measurements.stream().anyMatch(m -> AssessmentCatalogue.HEALTH_MEASUREMENTS.contains(m.key()))
                || form.questions().stream().anyMatch(q -> AssessmentCatalogue.HEALTH_QUESTIONS.contains(q.id()));
        LocalDate today = LocalDate.now(ZoneId.of(repo.zoneOf(client)));
        boolean done = row.done();

        var asked = new PortalAssessment.Asked(measurements.stream().map(m -> new PortalAssessment.Measurement(m.key(), m.label(), m.group(), m.unit(), true)).toList(),
                form.questions());
        var rawReadings = new HashMap<>(AssessmentJson.plainMap(row.readings()));
        if (hideWeight) rawReadings.remove("weight");
        var entry = new AssessmentDetail.Entry(rawReadings, AssessmentJson.plainMap(row.answers()));

        List<PortalAssessment.Reading> readings = null;
        List<AssessmentDetail.AnswerView> answers = null;
        List<AssessmentDetail.History> history = null;
        List<AssessmentDetail.Returned> returned = null;
        if (done) {
            var keys = measurements.stream().map(AssessmentDetail.FormMeasurement::key).toList();
            var points = new HashMap<String, List<AssessmentDetail.Point>>();
            for (var p : assessments.history(client, keys)) {
                points.computeIfAbsent(p.key(), k -> new ArrayList<>()).add(new AssessmentDetail.Point(p.assessmentId(), p.at().toEpochMilli(), p.value()));
            }
            history = new ArrayList<>();
            for (String k : keys) if (points.containsKey(k)) history.add(new AssessmentDetail.History(k, points.get(k)));

            var stored = AssessmentJson.readings(row.readings());
            readings = new ArrayList<>();
            for (var m : measurements) {
                BigDecimal value = stored.get(m.key());
                if (value == null) continue;
                BigDecimal previous = null;
                for (var pt : points.getOrDefault(m.key(), List.of())) {
                    if (pt.at() < row.completedAt().toEpochMilli() && !pt.assessmentId().equals(row.id().toString())) previous = (BigDecimal) pt.value();
                }
                readings.add(new PortalAssessment.Reading(m.key(), m.label(), m.group(), m.unit(), value, previous, previous == null ? null : value.subtract(previous)));
            }
            answers = answerViews(form, AssessmentJson.plainMap(row.answers()));
            returned = assessments.returned(client).stream().filter(r -> !r.id().equals(row.id().toString())).toList();
        }
        return new PortalAssessment.Detail(row.id().toString(), row.name(), done ? "done" : "open", row.sentAt() == null ? null : row.sentAt().toEpochMilli(),
                row.dueOn().toString(), !done && row.dueOn().isBefore(today), done ? row.completedAt().toEpochMilli() : null, row.version(), asked, entry,
                hideWeight, health ? HEALTH_NOTICE : null, readings, answers, history, returned);
    }

    /** Only what was answered, in the form's order, resolved against its question — the trainer's own rendering. */
    private static List<AssessmentDetail.AnswerView> answerViews(AssessmentForms.Form form, Map<String, Object> stored) {
        var out = new ArrayList<AssessmentDetail.AnswerView>();
        for (var q : form.questions()) {
            if (!stored.containsKey(q.id())) continue;
            var a = AssessmentJson.convert(stored.get(q.id()), com.inclineyou.inclineyou_backend.core.assessment.dto.EntryRequest.Answer.class);
            switch (q.kind()) {
                case "yesno" -> out.add(new AssessmentDetail.AnswerView(q.id(), q.text(), q.kind(), null, a.yes(), null, null, null, null));
                case "rating" -> out.add(new AssessmentDetail.AnswerView(q.id(), q.text(), q.kind(), q.scale(), null, a.rating(), null, null, null));
                case "text" -> out.add(new AssessmentDetail.AnswerView(q.id(), q.text(), q.kind(), null, null, null, null, null, a.text()));
                default -> {
                    var ids = a.optionIds() == null ? List.<String>of() : a.optionIds();
                    var chosen = q.options().stream().filter(o -> ids.contains(o.id())).map(AssessmentCatalogue.Option::text).toList();
                    out.add(new AssessmentDetail.AnswerView(q.id(), q.text(), q.kind(), null, null, null, ids, chosen, a.text()));
                }
            }
        }
        return out;
    }

    // ── take it ──────────────────────────────────────────────────────────────────────────────────

    @Transactional
    public PortalAssessment.Detail put(String phone, UUID id, String ifMatch, PortalAssessment.Entry req) {
        UUID client = access.clientId(phone);
        IfMatch.require(ifMatch, "the assessment");
        var row = assessments.findForClient(client, id, true).orElseThrow(PortalAssessmentService::notFound);
        if (row.done()) throw ApiException.conflict("ASSESSMENT_COMPLETED", "You’ve already handed this one in. Your trainer can correct it if something’s wrong.");
        IfMatch.check(ifMatch, row.version(), "This assessment changed since you opened it. Reload to see it.");

        // With weight hidden it is not on the form the client sees, so it cannot be sent either.
        boolean hideWeight = repo.hideWeight(client);
        var form = AssessmentForms.read(row.form());
        var asked = hideWeight ? new AssessmentForms.Form(form.measurements().stream().filter(m -> !"weight".equals(m.key())).toList(), form.questions()) : form;
        var readings = AssessmentEntryService.readings(asked, req.readings());
        var answers = AssessmentEntryService.answers(asked, req.answers());
        boolean submit = req.complete();
        if (submit && readings.isEmpty() && answers.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "NOTHING_ENTERED", "Nothing has been entered: add a measurement or an answer.");
        }

        assessments.saveClientEntry(id, AssessmentJson.write(readings), AssessmentJson.write(answers), submit);
        if (submit && row.scheduleId() != null) advance(row);
        return detail(client, assessments.findForClient(client, id, false).orElseThrow());
    }

    /** The cycle moves on from the day it was DONE, in the trainer's calendar — the trainer's own rule (R34) through the V24 doors. */
    private void advance(AssessmentRow row) {
        JsonNode cycle = repo.cycleTemplate(row.id()).orElse(null);
        if (cycle == null) return;   // the cycle ended, or the template was deleted: this was its last
        var tpl = JSON.treeToValue(cycle.path("template"), TemplateJson.class);
        var stored = new AssessmentTemplateJdbcRepository.Stored(UUID.fromString(tpl.id()), tpl.name(), tpl.description(),
                AssessmentJson.read(JSON.writeValueAsString(tpl.measurements()), com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateItem.Measurements.class),
                AssessmentJson.read(JSON.writeValueAsString(tpl.questions()), com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateItem.Questions.class),
                Instant.now(), Instant.now(), false, null, false);
        LocalDate next = LocalDate.now(ZoneId.of(cycle.path("timezone").asString("Asia/Kolkata"))).plusDays(cycle.path("interval_days").asInt());
        repo.bookNext(row.id(), next, AssessmentJson.write(AssessmentForms.copyOf(stored)), tpl.name());
    }

    /** The template as the V24 door returns it. Unknown keys are ignored: only these are the copy's business. */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    record TemplateJson(String id, String name, String description, tools.jackson.databind.JsonNode measurements, tools.jackson.databind.JsonNode questions) {}

    // ── start one ────────────────────────────────────────────────────────────────────────────────

    public PortalAssessment.Templates templates(String phone) {
        UUID client = access.clientId(phone);
        var out = new ArrayList<PortalAssessment.Template>();
        for (var t : templates.live(repo.trainerOf(client))) {
            if (!t.clientCanStart()) continue;
            out.add(new PortalAssessment.Template(t.id().toString(), t.name(), t.description(), t.systemKey(),
                    new PortalAssessment.Asks(t.measurements().on() ? t.measurements().keys().size() : 0, t.questions().on() ? t.questions().items().size() : 0),
                    repo.openOf(client, t.id()).orElse(null)));
        }
        return new PortalAssessment.Templates(out);
    }

    /** The shelf's version: the newest edit among what is offered, so a conditional re-read is honest. */
    public String templatesVersion(String phone) {
        UUID client = access.clientId(phone);
        return String.valueOf(templates.live(repo.trainerOf(client)).stream().filter(AssessmentTemplateJdbcRepository.Stored::clientCanStart)
                .mapToLong(t -> t.updatedAt().toEpochMilli()).max().orElse(0));
    }

    public record Started(PortalAssessment.Detail detail, boolean created) {}

    @Transactional
    public Started start(String phone, PortalAssessment.Start req) {
        UUID client = access.clientId(phone);
        UUID id = uuid(req.id(), "id");
        UUID templateId = uuid(req.templateId(), "templateId");
        var tpl = templates.find(repo.trainerOf(client), templateId).filter(t -> !t.deleted() && t.clientCanStart())
                .orElseThrow(() -> ApiException.notFound("That assessment isn’t on offer."));
        LocalDate today = LocalDate.now(ZoneId.of(repo.zoneOf(client)));
        var res = repo.start(id, client, templateId, AssessmentJson.write(AssessmentForms.copyOf(tpl)), tpl.name(), today);
        return switch (res.path("result").asString()) {
            case "created" -> new Started(get(client, id), true);
            case "existing" -> new Started(get(client, UUID.fromString(res.path("id").asString())), false);
            case "conflict" -> throw ApiException.idConflict();
            default -> throw ApiException.notFound("That assessment isn’t on offer.");
        };
    }

    private PortalAssessment.Detail get(UUID client, UUID id) {
        return detail(client, assessments.findForClient(client, id, false).orElseThrow(PortalAssessmentService::notFound));
    }

    private static UUID uuid(String raw, String field) {
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.validation(field + ": not an id");
        }
    }

    static ApiException notFound() {
        return ApiException.notFound("That assessment isn’t yours.");
    }
}
