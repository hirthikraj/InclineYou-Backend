package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.client.ClientScheduleService;
import com.inclineyou.inclineyou_backend.core.program.dto.ApplyRequest;
import com.inclineyou.inclineyou_backend.core.program.dto.ProgramItem;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
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

    private final ProgramJdbcRepository repo;
    private final PlanTreeJdbcRepository trees;
    private final ProgramReadService read;
    private final ClientScheduleService schedules;
    private final WorkspaceClock clock;

    /** The new plan with {@code linkedSessions}; {@code created} is 201, a replayed id is 200. */
    public record Applied(ProgramItem plan, boolean created) {}

    @Transactional
    public Applied apply(UUID trainerId, UUID templateId, ApplyRequest req) {
        var source = repo.copySource(trainerId, templateId).orElseThrow(() -> ApiException.notFound("That program is not yours."));
        if (source.clientId() != null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_NOT_TEMPLATE",
                    "That is a client's plan. Copy it into a template first.");
        }
        String clientStatus = repo.lockClientStatus(trainerId, req.clientId())
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        var existing = repo.planOwnership(trainerId, id, req.clientId());
        if (existing.isPresent()) {
            if (!existing.get()) throw ApiException.idConflict();
            return new Applied(read.get(trainerId, id).withLinked(0), false);
        }
        if ("archived".equals(clientStatus)) {
            throw ApiException.conflict("CLIENT_ARCHIVED", "This client is archived. Unarchive them first.");
        }
        ZoneId zone = clock.zone();
        LocalDate start = req.startDate() != null ? req.startDate() : WorkspaceClock.today(zone);
        if (req.endDate() != null && req.endDate().isBefore(start)) throw ApiException.validation("endDate: before startDate");

        repo.completeOthers(req.clientId().toString(), id);
        repo.insertPlan(id, trainerId, req.clientId(), templateId, req.name(), req.goal(), start, req.endDate());
        trees.copy(templateId, id, trainerId);
        int linked = schedules.linkWorkouts(req.clientId(), schedules.futureOpen(req.clientId()), zone);
        log.info("program applied trainer={} client={} template={} plan={} linked={}", trainerId, req.clientId(), templateId, id, linked);
        return new Applied(read.get(trainerId, id).withLinked(linked), true);
    }
}
