package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.program.dto.ProgramApplied;
import com.inclineyou.inclineyou_backend.core.client.ClientScheduleService;
import com.inclineyou.inclineyou_backend.core.program.dto.ApplyRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.DateWindow;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

/**
 * {@code POST /v1/programs/{templateId}/apply} (Programs A5): give a client a copy
 * of a template.
 *
 * <p>Deep-copies the template into a client plan, completes the plan already
 * active (R50: replaced, never refused), and links the client's booked future
 * sessions to the new plan's workouts. The week is not touched: step 3's
 * {@code PUT /schedule} is its one write path, so slots and bookings have one
 * writer instead of two that could disagree.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProgramApplyService {

    /** A plan's longest, as {@code program_length} allows a template. */
    private static final int MAX_WEEKS = 52;


    private final ProgramJdbcRepository repo;
    private final PlanTreeJdbcRepository trees;
    private final ProgramReadService read;
    private final ClientScheduleService schedules;
    private final WorkspaceClock clock;

    @Transactional
    public ProgramApplied apply(UUID trainerId, UUID templateId, ApplyRequest req) {
        var source = repo.copySource(trainerId, templateId).orElseThrow(() -> ApiException.notFound("That program is not yours."));
        if (source.clientId() != null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_NOT_TEMPLATE",
                    "That is a client's plan. Copy it into a template first.");
        }
        String clientStatus = repo.lockClientStatus(trainerId, req.clientId())
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        var existing = repo.planOwnership(trainerId, id, req.clientId(), templateId);
        if (existing.isPresent()) {
            if (!existing.get()) throw ApiException.idConflict();
            return new ProgramApplied(read.get(trainerId, id).withLinked(0), false);
        }
        if ("archived".equals(clientStatus)) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        ZoneId zone = clock.zone();
        LocalDate today = WorkspaceClock.today(zone);
        // A start within three months of today either way (18 Nov 2026): 2062 for 2026 counted the plan's weeks from
        // then, so no booked session ever got a workout. The end is at most 52 weeks on, a plan's longest.
        LocalDate start = req.startDate() != null ? DateWindow.check(req.startDate(), today, "startDate") : today;
        if (req.endDate() != null && req.endDate().isBefore(start)) throw ApiException.validation("endDate: before startDate");
        if (req.endDate() != null && req.endDate().isAfter(start.plusWeeks(MAX_WEEKS).minusDays(1))) {
            throw ApiException.validation("endDate: at most " + MAX_WEEKS + " weeks after startDate");
        }

        repo.completeOthers(req.clientId().toString(), id);
        repo.insertPlan(id, trainerId, req.clientId(), templateId, req.name(), req.goal(), start, req.endDate());
        trees.copy(templateId, id, trainerId);
        // A library program given straight to a client is a use, as copying it into a template is (18 Nov 2026).
        if ("inclineyou".equals(source.origin())) repo.countUse(templateId);
        int linked = schedules.linkWorkouts(req.clientId(), schedules.futureOpen(req.clientId()), zone);
        log.info("program applied trainer={} client={} template={} plan={} linked={}", trainerId, req.clientId(), templateId, id, linked);
        return new ProgramApplied(read.get(trainerId, id).withLinked(linked), true);
    }
}
