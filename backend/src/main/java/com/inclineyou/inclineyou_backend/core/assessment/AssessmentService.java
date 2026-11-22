package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.ScheduleItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDeleted;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentCreated;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.Catalog;
import com.inclineyou.inclineyou_backend.core.assessment.dto.CreateAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.MoveAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.client.ClientNoticeJdbcRepository;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.DateWindow;
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
 *
 * <p>api-contract 1.2: an assessment given to a client on the portal is visible to them at once ({@code sendNow}, default
 * true), because {@code sent_at} is the one thing that makes it so. {@code false} keeps it the trainer's to take in the
 * session, and {@link #send} sends it later. Sending writes one {@code checkin} notice, through the same door as every other
 * trainer-to-client notice, so the client's own switch for it is honoured and a refused notice is no row and no error.
 */
@Service
@RequiredArgsConstructor
public class AssessmentService {

    private final AssessmentJdbcRepository assessments;
    private final AssessmentScheduleJdbcRepository schedules;
    private final AssessmentTemplateJdbcRepository templates;
    private final AssessmentBooker booker;
    private final ClientNoticeJdbcRepository notices;
    private final WorkspaceClock clock;
    private final com.inclineyou.inclineyou_backend.core.client.ConsentGate consent;

    /** Served from code, not a table; it changes only on a deploy. */
    public Catalog catalog() {
        return new Catalog(AssessmentCatalogue.OFFERED_GROUPS,
                AssessmentCatalogue.OFFERED.stream()
                        .map(m -> {
                            var b = AssessmentCatalogue.boundOf(m.key());
                            return new Catalog.CatalogMeasurement(m.key(), m.label(), m.group(), m.unit(), m.metric() != null,
                                    b.min(), b.minInclusive());
                        })
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
                new AssessmentDetail.Asked(form.measurements().stream().map(AssessmentDetail.AskedMeasurement::of).toList(), form.questions()),
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
    public AssessmentCreated create(UUID trainerId, CreateAssessmentRequest req) {
        if (req.id() != null) {
            var mine = assessments.isMine(req.id(), trainerId, req.clientId());
            if (mine.isPresent()) {
                if (!mine.get()) throw ApiException.idConflict();
                var row = assessments.find(trainerId, req.id()).orElseThrow(ApiException::idConflict);
                return new AssessmentCreated(AssessmentForms.item(row, today()), false);
            }
        }
        var status = assessments.clientStatusForShare(trainerId, req.clientId())
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        if ("archived".equals(status)) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        // Health and body data wait for the client's consent (22 Nov 2026).
        consent.require(req.clientId(), "an assessment");
        var tpl = templates.find(trainerId, req.templateId()).filter(t -> !t.deleted())
                .orElseThrow(() -> ApiException.notFound("That assessment template is not in your library."));
        LocalDate today = today();
        // Within three months of today either way (19 Nov 2026): 1900 was missed on arrival and 2999 never came due.
        LocalDate due = req.dueOn() == null ? today : DateWindow.check(req.dueOn(), today, "dueOn");
        var booked = booker.tryBook(trainerId, req.clientId(), tpl, null, due, req.id());
        if (booked.isEmpty()) {
            // The id was taken between the lookup above and the INSERT: a double tap whose first request committed
            // meanwhile (19 Nov 2026). This trainer's assessment for this client is that one — answered, never sent again.
            var mine = assessments.isMine(req.id(), trainerId, req.clientId());
            if (mine.isPresent() && mine.get()) {
                var row = assessments.find(trainerId, req.id()).orElseThrow(ApiException::idConflict);
                return new AssessmentCreated(AssessmentForms.item(row, today), false);
            }
            throw ApiException.idConflict();
        }
        UUID id = booked.get();
        // sendNow is ignored for a client with nowhere to receive it, rather than refused: "Take now" is the same button either way.
        if ((req.sendNow() == null || req.sendNow()) && onPortal(trainerId, req.clientId())) {
            deliver(id, req.clientId(), tpl.name());
        }
        return new AssessmentCreated(AssessmentForms.item(assessments.find(trainerId, id).orElseThrow(), today), true);
    }

    /**
     * Send one that was kept in person only. Idempotent by target state: one already sent answers as it is, with no second
     * notice — a retry after a dropped response must not tell the client twice.
     */
    @Transactional
    public AssessmentItem send(UUID trainerId, UUID id) {
        var row = assessments.lock(trainerId, id).filter(r -> !r.deleted()).orElseThrow(AssessmentService::notFound);
        var status = assessments.clientStatus(trainerId, row.clientId()).orElseThrow(AssessmentService::notFound);
        if ("archived".equals(status)) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        if (row.done()) {
            throw ApiException.conflict("ASSESSMENT_COMPLETED", "That assessment is already done, so there is nothing to send.");
        }
        if (!onPortal(trainerId, row.clientId())) {
            throw ApiException.conflict("CLIENT_NOT_ON_PORTAL", "They haven’t joined the portal yet, so there is nowhere to send it.");
        }
        // One started in person stays in person (20 Nov 2026, the owner's call): sent, the client saw the trainer's
        // half-entered readings and answers, could change them, and submitted them as their own. An already-sent one is
        // still the idempotent 200 below, whatever the client has entered since.
        if (!row.sent() && row.started()) {
            throw ApiException.conflict("ASSESSMENT_STARTED",
                    "You've already started this one in person, so it can't be sent. Finish it in the session.");
        }
        if (!row.sent()) deliver(id, row.clientId(), row.name());
        return AssessmentForms.item(assessments.find(trainerId, id).orElseThrow(), today());
    }

    /** {@code sent_at}, then the notice. The notice is the client being told; the row is what makes it theirs to open. */
    private void deliver(UUID id, UUID clientId, String name) {
        assessments.markSent(id);
        notices.mint(clientId, "checkin", "A new assessment is waiting: " + name + ".", null);
    }

    /** A paused client is still on the portal (they cannot open it, and are not told); one who never joined, or left, is not. */
    private boolean onPortal(UUID trainerId, UUID clientId) {
        return assessments.membership(trainerId, clientId).map(m -> m.equals("accepted") || m.equals("paused")).orElse(false);
    }

    /** Move the date. A cycle's open assessment also moves the cycle's own next date. */
    @Transactional
    public AssessmentItem move(UUID trainerId, UUID id, String ifMatch, MoveAssessmentRequest req) {
        var row = assessments.lock(trainerId, id).filter(r -> !r.deleted()).orElseThrow(AssessmentService::notFound);
        if (row.done()) {
            throw ApiException.conflict("ASSESSMENT_COMPLETED", "That assessment is already done, so it has no date to move.");
        }
        IfMatch.check(ifMatch, row.version(), "This assessment changed since you opened it. Reload to see it.");
        // Within three months of today either way (19 Nov 2026), as giving one is.
        DateWindow.check(req.dueOn(), today(), "dueOn");
        assessments.setDue(id, req.dueOn());
        if (row.scheduleId() != null) {
            schedules.lock(trainerId, row.scheduleId()).filter(AssessmentScheduleJdbcRepository.Locked::live)
                    .ifPresent(s -> schedules.update(s.id(), req.dueOn(), null, null));
        }
        return AssessmentForms.item(assessments.find(trainerId, id).orElseThrow(), today());
    }

    /**
     * Soft, and idempotent. Deleting a cycle's open assessment skips it (R38): the
     * cycle books the next at {@code due_on + interval}, so it is never left
     * without a date — ending the cycle is how to stop it.
     */
    @Transactional
    public AssessmentDeleted delete(UUID trainerId, UUID id) {
        var row = assessments.lock(trainerId, id).orElseThrow(AssessmentService::notFound);
        if (row.deleted()) {
            // A retry of a skip whose answer was lost (19 Nov 2026): answer the cycle's open assessment, which is the one
            // the first call booked (or what replaced it), rather than "no next", so a screen can trust the answer.
            if (row.done() || row.scheduleId() == null) return new AssessmentDeleted(null);
            var open = schedules.one(trainerId, row.scheduleId())
                    .filter(c -> c.endedAt() == null).map(ScheduleItem::openAssessmentId)
                    .flatMap(o -> assessments.find(trainerId, UUID.fromString(o)));
            return new AssessmentDeleted(open.map(r -> AssessmentForms.item(r, today())).orElse(null));
        }
        assessments.softDelete(id);
        if (row.done() || row.scheduleId() == null) return new AssessmentDeleted(null);

        var cycle = schedules.lock(trainerId, row.scheduleId()).filter(AssessmentScheduleJdbcRepository.Locked::live).orElse(null);
        var tpl = cycle == null ? null : templates.find(trainerId, cycle.templateId()).filter(t -> !t.deleted()).orElse(null);
        if (tpl == null) return new AssessmentDeleted(null);
        // Never in the past (19 Nov 2026): skipping one 3 months overdue on a 28-day cycle booked one already missed, and
        // the trainer had to delete again and again to reach today.
        LocalDate stepped = row.dueOn().plusDays(cycle.intervalDays()), today = today();
        LocalDate next = stepped.isBefore(today) ? today : stepped;
        schedules.update(cycle.id(), next, null, null);
        UUID booked = booker.book(trainerId, row.clientId(), tpl, cycle.id(), next, null);
        return new AssessmentDeleted(AssessmentForms.item(assessments.find(trainerId, booked).orElseThrow(), today()));
    }

    private LocalDate today() {
        return WorkspaceClock.today(clock.zone());
    }

    static ApiException notFound() {
        return ApiException.notFound("That assessment is not on your books.");
    }
}
