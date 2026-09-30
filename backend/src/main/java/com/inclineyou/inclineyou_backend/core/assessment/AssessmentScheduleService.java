package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.CreateScheduleRequest;
import com.inclineyou.inclineyou_backend.core.assessment.dto.ScheduleItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.UpdateScheduleRequest;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * api-contract 1.1 Assessments — a client's cycle on one template: every N days,
 * one open assessment at a time (uq_assessment_schedule_open).
 *
 * <p>The cycle and its first assessment are one write. Finishing an assessment
 * moves the cycle on ({@link AssessmentEntryService}); deleting the open one skips
 * it ({@link AssessmentService#delete}); and stopping it is {@code …/end}, a verb
 * like every other state change on this wire, so PATCH only ever moves dates and
 * pace. An assessment somebody has started survives the cycle ending or being
 * deleted — the trainer has real numbers on it — and an unstarted one goes with it.
 */
@Service
@RequiredArgsConstructor
public class AssessmentScheduleService {

    private final AssessmentScheduleJdbcRepository schedules;
    private final AssessmentJdbcRepository assessments;
    private final AssessmentTemplateJdbcRepository templates;
    private final AssessmentBooker booker;
    private final WorkspaceClock clock;

    public record Created(ScheduleItem schedule, boolean created) {}

    /** Live first, then ended. A client is the caller's or a 404. */
    public List<ScheduleItem> forClient(UUID trainerId, UUID clientId) {
        if (clientId == null) throw ApiException.validation("clientId: required");
        assessments.clientStatus(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        return schedules.forClient(trainerId, clientId);
    }

    @Transactional
    public Created create(UUID trainerId, CreateScheduleRequest req) {
        if (req.id() != null) {
            var mine = schedules.isMine(req.id(), trainerId);
            if (mine.isPresent()) {
                if (!mine.get()) throw ApiException.idConflict();
                return new Created(one(trainerId, req.id()), false);
            }
        }
        var status = assessments.clientStatus(trainerId, req.clientId())
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        if ("archived".equals(status)) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        var tpl = templates.find(trainerId, req.templateId()).filter(t -> !t.deleted())
                .orElseThrow(() -> ApiException.notFound("That assessment template is not in your library."));
        if (schedules.liveExists(req.clientId(), tpl.id())) throw live();
        LocalDate first = req.firstDueOn() == null ? WorkspaceClock.today(clock.zone()) : req.firstDueOn();
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        try {
            if (!schedules.insert(id, trainerId, req.clientId(), tpl.id(), req.intervalDays(), first)) {
                throw ApiException.idConflict();
            }
        } catch (DuplicateKeyException e) {
            // The pre-check above answers the ordinary case; this is two creates racing.
            String msg = String.valueOf(e.getMostSpecificCause().getMessage());
            throw msg.contains("uq_assessment_schedule_live") ? live() : ApiException.idConflict();
        }
        booker.book(trainerId, req.clientId(), tpl, id, first, null);
        return new Created(one(trainerId, id), true);
    }

    /** Send only what changed. {@code nextDueOn} also moves the open assessment's date. */
    @Transactional
    public ScheduleItem patch(UUID trainerId, UUID id, String ifMatch, UpdateScheduleRequest req) {
        if (req.isEmpty()) throw ApiException.validation("nextDueOn: send nextDueOn or intervalDays");
        var cycle = live(trainerId, id);
        if (cycle.endedAt() != null) {
            throw ApiException.conflict("SCHEDULE_ENDED", "That cycle has ended, so it cannot be moved or re-paced.");
        }
        IfMatch.check(ifMatch, cycle.version(), "This cycle changed since you opened it. Reload to see it.");
        LocalDate due = req.nextDueOn() == null ? null : req.nextDueOn().value();
        schedules.update(id, due, req.intervalDays() == null ? null : req.intervalDays().value());
        if (due != null) assessments.moveOpenDue(id, due);
        return one(trainerId, id);
    }

    /** Idempotent by target state: an ended cycle answers as it is. */
    @Transactional
    public ScheduleItem end(UUID trainerId, UUID id) {
        var cycle = live(trainerId, id);
        if (cycle.endedAt() == null) {
            schedules.end(id);
            assessments.softDeleteOpenUnstarted(id);
        }
        return one(trainerId, id);
    }

    /** Soft, and idempotent: a deleted cycle answers 204 again. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        var cycle = schedules.lock(trainerId, id).orElseThrow(AssessmentScheduleService::notFound);
        if (cycle.deleted()) return;
        schedules.softDelete(id);
        assessments.softDeleteOpenUnstarted(id);
    }

    /** Locked, and 404 for a deleted one: there is nothing left to end or move. */
    private AssessmentScheduleJdbcRepository.Locked live(UUID trainerId, UUID id) {
        return schedules.lock(trainerId, id).filter(c -> !c.deleted()).orElseThrow(AssessmentScheduleService::notFound);
    }

    private ScheduleItem one(UUID trainerId, UUID id) {
        return schedules.one(trainerId, id).orElseThrow(ApiException::idConflict);
    }

    private static ApiException live() {
        return ApiException.conflict("SCHEDULE_LIVE", "This client is already on a cycle of that form.");
    }

    private static ApiException notFound() {
        return ApiException.notFound("That cycle is not on your books.");
    }
}
