package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.Catalog;
import com.inclineyou.inclineyou_backend.core.assessment.dto.CreateAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.MoveAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * api-contract 1.1 Assessments — one assessment: its page, giving one to a
 * client, moving its date, removing it. Recording what was measured is
 * {@link AssessmentEntryService}; the list is {@link AssessmentListService}.
 *
 * <p>{@code state} is derived (V14), and "today" is the workspace's calendar day.
 * The form an assessment asks is its own copy of the template, so an assessment
 * whose template was deleted still opens ({@code template.deleted: true}).
 */
@Service
@RequiredArgsConstructor
public class AssessmentService {

    private final AssessmentJdbcRepository assessments;
    private final AssessmentScheduleJdbcRepository schedules;
    private final AssessmentTemplateJdbcRepository templates;
    private final AssessmentBooker booker;
    private final WorkspaceClock clock;

    public record Created(AssessmentItem item, boolean created) {}

    /** {@code next}: what the cycle booked in the deleted one's place, null for a one-off. */
    public record Deleted(AssessmentItem next) {}

    /** Served from code, not a table; it changes only on a deploy. */
    public Catalog catalog() {
        return new Catalog(AssessmentCatalogue.OFFERED_GROUPS,
                AssessmentCatalogue.OFFERED.stream()
                        .map(m -> new Catalog.CatalogMeasurement(m.key(), m.label(), m.group(), m.unit(), m.metric() != null))
                        .toList(),
                AssessmentCatalogue.QUESTIONS);
    }

    // ── One, assembled ────────────────────────────────────────────────────────

    public AssessmentDetail get(UUID trainerId, UUID id) {
        var row = assessments.find(trainerId, id).orElseThrow(AssessmentService::notFound);
        var item = AssessmentForms.item(row, today());
        var form = AssessmentForms.read(row.form());

        var client = assessments.clientRef(row.clientId()).orElseThrow(AssessmentService::notFound);
        var tpl = templates.find(trainerId, row.templateId()).orElse(null);
        var template = tpl == null ? new AssessmentDetail.TemplateRef(row.templateId().toString(), row.name(), null, true)
                : new AssessmentDetail.TemplateRef(tpl.id().toString(), tpl.name(), tpl.description(), tpl.deleted());
        var schedule = row.scheduleId() == null ? null : schedules.one(trainerId, row.scheduleId()).orElse(null);

        var rawReadings = AssessmentJson.plainMap(row.readings());
        var rawAnswers = AssessmentJson.plainMap(row.answers());
        var readings = readings(form, AssessmentJson.readings(row.readings()));
        var answers = answers(form, rawAnswers);

        return new AssessmentDetail(item, client, template, schedule,
                new AssessmentDetail.Asked(form.measurements(), form.questions()),
                new AssessmentDetail.Entry(rawReadings, rawAnswers), readings, answers,
                history(row.clientId(), form), assessments.returned(row.clientId()));
    }

    /** Only what was entered, in the form's order — a reading the form never asked has nowhere to be drawn. */
    private static List<AssessmentDetail.ReadingView> readings(AssessmentForms.Form form, Map<String, java.math.BigDecimal> stored) {
        var out = new ArrayList<AssessmentDetail.ReadingView>();
        for (var m : form.measurements()) {
            var value = stored.get(m.key());
            if (value != null) {
                out.add(new AssessmentDetail.ReadingView(m.key(), m.label(), m.group(), m.unit(),
                        MetricCatalogue.has(m.key()), value));
            }
        }
        return out;
    }

    private static List<AssessmentDetail.AnswerView> answers(AssessmentForms.Form form, Map<String, Object> stored) {
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

    /** Every key this assessment asks, from this client's completed ones, in one read. */
    private List<AssessmentDetail.History> history(UUID clientId, AssessmentForms.Form form) {
        var keys = form.measurements().stream().map(AssessmentDetail.FormMeasurement::key).toList();
        var byKey = new HashMap<String, List<AssessmentDetail.Point>>();
        for (var p : assessments.history(clientId, keys)) {
            byKey.computeIfAbsent(p.key(), k -> new ArrayList<>())
                    .add(new AssessmentDetail.Point(p.assessmentId(), p.at().toEpochMilli(), p.value()));
        }
        var out = new ArrayList<AssessmentDetail.History>();
        for (String k : keys) if (byKey.containsKey(k)) out.add(new AssessmentDetail.History(k, byKey.get(k)));
        return out;
    }

    // ── Writes ────────────────────────────────────────────────────────────────

    /** Assign for a date, or — with {@code dueOn} today — take it now. */
    @Transactional
    public Created create(UUID trainerId, CreateAssessmentRequest req) {
        if (req.id() != null) {
            var mine = assessments.isMine(req.id(), trainerId, req.clientId());
            if (mine.isPresent()) {
                if (!mine.get()) throw ApiException.idConflict();
                var row = assessments.find(trainerId, req.id()).orElseThrow(ApiException::idConflict);
                return new Created(AssessmentForms.item(row, today()), false);
            }
        }
        var status = assessments.clientStatus(trainerId, req.clientId())
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        if ("archived".equals(status)) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        var tpl = templates.find(trainerId, req.templateId()).filter(t -> !t.deleted())
                .orElseThrow(() -> ApiException.notFound("That assessment template is not in your library."));
        LocalDate today = today();
        UUID id = booker.book(trainerId, req.clientId(), tpl, null, req.dueOn() == null ? today : req.dueOn(), req.id());
        return new Created(AssessmentForms.item(assessments.find(trainerId, id).orElseThrow(), today), true);
    }

    /** Move the date. A cycle's open assessment also moves the cycle's own next date. */
    @Transactional
    public AssessmentItem move(UUID trainerId, UUID id, String ifMatch, MoveAssessmentRequest req) {
        var row = assessments.lock(trainerId, id).filter(r -> !r.deleted()).orElseThrow(AssessmentService::notFound);
        if (row.done()) {
            throw ApiException.conflict("ASSESSMENT_COMPLETED", "That assessment is already done, so it has no date to move.");
        }
        IfMatch.check(ifMatch, row.version(), "This assessment changed since you opened it. Reload to see it.");
        assessments.setDue(id, req.dueOn());
        if (row.scheduleId() != null) {
            schedules.lock(trainerId, row.scheduleId()).filter(AssessmentScheduleJdbcRepository.Locked::live)
                    .ifPresent(s -> schedules.update(s.id(), req.dueOn(), null));
        }
        return AssessmentForms.item(assessments.find(trainerId, id).orElseThrow(), today());
    }

    /**
     * Soft, and idempotent. Deleting a cycle's open assessment skips it (R38): the
     * cycle books the next at {@code due_on + interval}, so it is never left
     * without a date — ending the cycle is how to stop it.
     */
    @Transactional
    public Deleted delete(UUID trainerId, UUID id) {
        var row = assessments.lock(trainerId, id).orElseThrow(AssessmentService::notFound);
        if (row.deleted()) return new Deleted(null);
        assessments.softDelete(id);
        if (row.done() || row.scheduleId() == null) return new Deleted(null);

        var cycle = schedules.lock(trainerId, row.scheduleId()).filter(AssessmentScheduleJdbcRepository.Locked::live).orElse(null);
        var tpl = cycle == null ? null : templates.find(trainerId, cycle.templateId()).filter(t -> !t.deleted()).orElse(null);
        if (tpl == null) return new Deleted(null);
        LocalDate next = row.dueOn().plusDays(cycle.intervalDays());
        schedules.update(cycle.id(), next, null);
        UUID booked = booker.book(trainerId, row.clientId(), tpl, cycle.id(), next, null);
        return new Deleted(AssessmentForms.item(assessments.find(trainerId, booked).orElseThrow(), today()));
    }

    private LocalDate today() {
        return WorkspaceClock.today(clock.zone());
    }

    static ApiException notFound() {
        return ApiException.notFound("That assessment is not on your books.");
    }
}
