package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import com.inclineyou.inclineyou_backend.core.assessment.dto.EntryRequest;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * {@code PUT /v1/assessments/{id}/entry} — the one write for what was measured and
 * answered: save for later, finish, or correct.
 *
 * <p>The whole entry is replaced, which is why the request is conditional. A stale
 * tab (or a second device) that saved over a newer entry would silently lose
 * real measurements, so a missing {@code If-Match} is 428 and a stale one 412.
 * Readings exist only here — a body is measured in an assessment and nowhere
 * else — so this is also the only way a reading is ever corrected.
 *
 * <ul>
 *   <li>{@code complete: false} on an open assessment saves a draft; the state is unchanged.
 *   <li>{@code complete: true} the first time sets {@code completed_at} and
 *       {@code entered_by = 'trainer'}, and — if it belongs to a live cycle — moves
 *       the cycle on in the same transaction (R34): {@code next_due_on = completed
 *       day + interval}, and the next open assessment is booked.
 *   <li>Saving a done one again is a correction. It stays done, keeps its date
 *       unless {@code completedAt} is given, and never moves the cycle.
 * </ul>
 *
 * <p>The database checks that readings are numbers in range keyed by the form and
 * that answers are keyed by its questions (assessment_readings_valid,
 * assessment_answers_valid); the per-kind answer rules live here. An answer with
 * nothing in it — a cleared text box, a choice with nothing ticked — is
 * "unanswered" and is not stored, rather than an error.
 */
@Service
@RequiredArgsConstructor
public class AssessmentEntryService {

    private static final BigDecimal LOWER = BigDecimal.ZERO;
    private static final BigDecimal UPPER = BigDecimal.valueOf(100_000);
    private static final int MAX_ANSWER_TEXT = 2000;
    private static final int MAX_CUSTOM_TEXT = 500;

    private final AssessmentJdbcRepository assessments;
    private final AssessmentScheduleJdbcRepository schedules;
    private final AssessmentTemplateJdbcRepository templates;
    private final AssessmentBooker booker;
    private final AssessmentService detail;
    private final WorkspaceClock clock;

    @Transactional
    public AssessmentDetail put(UUID trainerId, UUID id, String ifMatch, EntryRequest req) {
        IfMatch.require(ifMatch, "the assessment");
        var row = assessments.lock(trainerId, id).filter(r -> !r.deleted()).orElseThrow(AssessmentService::notFound);
        IfMatch.check(ifMatch, row.version(), "This assessment changed since you opened it. Reload to see it.");

        var form = AssessmentForms.read(row.form());
        var readings = readings(form, req.readings());
        var answers = answers(form, req.answers());
        boolean empty = readings.isEmpty() && answers.isEmpty();

        Instant now = Instant.now();
        Instant backDated = req.completedAt() == null ? null : Instant.ofEpochMilli(req.completedAt());
        if (backDated != null && backDated.isAfter(now)) throw ApiException.validation("completedAt: cannot be in the future");

        boolean first = !row.done() && req.complete();
        boolean finished = first || row.done();
        if (backDated != null && !finished) throw ApiException.validation("completedAt: only when completing");
        if (finished && empty) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "NOTHING_ENTERED", "Nothing has been entered: add a reading or an answer.");
        }

        // null leaves completed_at alone: a draft, or a correction that gave no date.
        Instant completedAt = first ? (backDated != null ? backDated : now) : backDated;
        assessments.saveEntry(id, AssessmentJson.write(readings), AssessmentJson.write(answers), completedAt, first);
        if (first && row.scheduleId() != null) advance(trainerId, row, completedAt);
        return detail.get(trainerId, id);
    }

    /** The cycle moves on from the day it was DONE, not the day it was due (R34). */
    private void advance(UUID trainerId, AssessmentRow row, Instant completedAt) {
        var cycle = schedules.lock(trainerId, row.scheduleId()).filter(AssessmentScheduleJdbcRepository.Locked::live).orElse(null);
        if (cycle == null) return; // ended or deleted: this was its last, and nothing more is booked
        var tpl = templates.find(trainerId, cycle.templateId()).filter(t -> !t.deleted()).orElse(null);
        if (tpl == null) return;
        LocalDate next = completedAt.atZone(clock.zone()).toLocalDate().plusDays(cycle.intervalDays());
        schedules.update(cycle.id(), next, null);
        booker.book(trainerId, row.clientId(), tpl, cycle.id(), next, null);
    }

    // ── readings ──────────────────────────────────────────────────────────────

    private static Map<String, BigDecimal> readings(AssessmentForms.Form form, Map<String, BigDecimal> sent) {
        var asked = form.measurements().stream().map(AssessmentDetail.FormMeasurement::key).collect(Collectors.toSet());
        var out = new LinkedHashMap<String, BigDecimal>();
        for (var e : sent.entrySet()) {
            String at = "readings." + e.getKey();
            if (!asked.contains(e.getKey())) throw ApiException.validation(at + ": this assessment does not ask for it");
            BigDecimal v = e.getValue();
            if (v == null || v.compareTo(LOWER) <= 0 || v.compareTo(UPPER) >= 0) {
                throw ApiException.validation(at + ": must be above 0 and below 100,000");
            }
            out.put(e.getKey(), v.scale() < 0 ? v.setScale(0) : v);
        }
        return out;
    }

    // ── answers ───────────────────────────────────────────────────────────────

    private static Map<String, EntryRequest.Answer> answers(AssessmentForms.Form form, Map<String, EntryRequest.Answer> sent) {
        var questions = new LinkedHashMap<String, AssessmentCatalogue.Question>();
        form.questions().forEach(q -> questions.put(q.id(), q));
        var out = new LinkedHashMap<String, EntryRequest.Answer>();
        for (var e : sent.entrySet()) {
            String at = "answers." + e.getKey();
            var q = questions.get(e.getKey());
            if (q == null) throw ApiException.validation(at + ": this assessment does not ask it");
            var a = answer(q, e.getValue(), at);
            if (a != null) out.put(e.getKey(), a);
        }
        return out;
    }

    /** Null when the answer holds nothing. */
    private static EntryRequest.Answer answer(AssessmentCatalogue.Question q, EntryRequest.Answer a, String at) {
        String text = a.text() == null || a.text().isBlank() ? null : a.text().strip();
        var ids = a.optionIds() == null ? java.util.List.<String>of() : a.optionIds();
        if (a.yes() == null && a.rating() == null && text == null && ids.isEmpty()) return null;

        switch (q.kind()) {
            case "yesno" -> {
                only(a.yes() != null && a.rating() == null && text == null && ids.isEmpty(), at, "yes");
                return new EntryRequest.Answer(a.yes(), null, null, null);
            }
            case "rating" -> {
                only(a.rating() != null && a.yes() == null && text == null && ids.isEmpty(), at, "rating");
                if (a.rating() < 1 || a.rating() > q.scale()) {
                    throw ApiException.validation(at + ".rating: between 1 and " + q.scale());
                }
                return new EntryRequest.Answer(null, a.rating(), null, null);
            }
            case "text" -> {
                only(text != null && a.yes() == null && a.rating() == null && ids.isEmpty(), at, "text");
                if (text.length() > MAX_ANSWER_TEXT) throw ApiException.validation(at + ".text: at most " + MAX_ANSWER_TEXT + " characters");
                return new EntryRequest.Answer(null, null, text, null);
            }
            default -> {
                only(a.yes() == null && a.rating() == null, at, "optionIds (and text where the question allows its own answer)");
                var valid = q.options().stream().map(AssessmentCatalogue.Option::id).collect(Collectors.toSet());
                var seen = new HashSet<String>();
                for (String id : ids) {
                    if (!valid.contains(id)) throw ApiException.validation(at + ".optionIds: " + id + " is not one of its options");
                    if (!seen.add(id)) throw ApiException.validation(at + ".optionIds: " + id + " twice");
                }
                if (ids.size() > 1 && !q.allowMultiple()) throw ApiException.validation(at + ".optionIds: this question takes one");
                if (text != null && !q.allowCustom()) throw ApiException.validation(at + ".text: this question has no custom answer");
                if (text != null && text.length() > MAX_CUSTOM_TEXT) {
                    throw ApiException.validation(at + ".text: at most " + MAX_CUSTOM_TEXT + " characters");
                }
                return new EntryRequest.Answer(null, null, text, ids.isEmpty() ? null : java.util.List.copyOf(ids));
            }
        }
    }

    private static void only(boolean ok, String at, String field) {
        if (!ok) throw ApiException.validation(at + ": takes only " + field);
    }
}
