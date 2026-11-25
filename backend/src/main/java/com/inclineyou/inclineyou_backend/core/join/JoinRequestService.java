package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.assessment.AssessmentService;
import com.inclineyou.inclineyou_backend.core.assessment.dto.CreateAssessmentRequest;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinApproved;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinRequestItem;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinRequestList;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Join requests, the trainer's side (api-contract 1.2, jl-a3…jl-a5). Approving is adding: the request becomes a prospect
 * whose portal is already open, because they gave their consent on the join page (V45 has the argument).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JoinRequestService {

    private static final List<String> STATES = List.of("pending", "approved", "declined");

    private final JoinJdbcRepository repo;
    private final AssessmentService assessments;
    private final com.inclineyou.inclineyou_backend.core.client.ClientJdbcRepository clients;

    public JoinRequestList list(UUID trainerId, UUID tenantId, String state) {
        var states = new ArrayList<String>();
        for (String s : (state == null || state.isBlank() ? "pending" : state).split(",")) {
            String t = s.strip();
            if (!STATES.contains(t)) throw ApiException.validation("state: pending, approved or declined, comma separated");
            if (!states.contains(t)) states.add(t);
        }
        var counts = repo.counts(trainerId, tenantId);
        return new JoinRequestList(repo.requests(trainerId, tenantId, states), new JoinRequestList.Counts(
                counts.getOrDefault("pending", 0), counts.getOrDefault("approved", 0), counts.getOrDefault("declined", 0)));
    }

    /**
     * Idempotent: an approved request answers its client again, with {@code checkInSent} false (it was sent the first time).
     * Every refusal leaves the request waiting, so the trainer can still decline it.
     */
    @Transactional
    public JoinApproved approve(UUID trainerId, UUID tenantId, UUID id, String clientType) {
        var before = repo.request(trainerId, tenantId, id).orElseThrow(JoinRequestService::notFound);
        boolean wasApproved = "approved".equals(before.status());
        var r = repo.approve(id, clientType == null ? "independent" : clientType);
        switch (r.path("result").asString()) {
            case "approved" -> { }
            case "not_pending" -> throw ApiException.conflict("JOIN_REQUEST_DECIDED", "You declined this request already.");
            case "already_client" -> throw ApiException.conflict("JOIN_ALREADY_CLIENT",
                    "This number is already on your client list. Decline the request and find them there.");
            case "with_another_trainer" -> throw ApiException.conflict("ALREADY_WITH_A_TRAINER",
                    "They’re with another trainer on InclineYou. They need to leave that trainer before you can add them.");
            case "unavailable" -> throw ApiException.conflict("JOIN_NUMBER_UNAVAILABLE",
                    "This number is a trainer’s account, so it can’t be a client.");
            default -> throw notFound();
        }
        UUID clientId = UUID.fromString(r.path("client_id").asString());
        UUID packId = r.path("pack_id").isString() ? UUID.fromString(r.path("pack_id").asString()) : null;
        // V48: they came through the join link, and asked about the pack they picked on the page.
        if (!wasApproved) clients.stampJoinLead(clientId, packId);
        boolean sent = false;
        if (!wasApproved && r.path("check_in_template_id").isString()) {
            UUID template = UUID.fromString(r.path("check_in_template_id").asString());
            // Checked first: a refusal inside the assessment service would mark this whole transaction for rollback.
            if (repo.ownTemplate(trainerId, template)) {
                assessments.create(trainerId, new CreateAssessmentRequest(null, clientId, template, null, true));
                sent = true;
            }
        }
        log.info("join request approved trainer={} request={} client={}", trainerId, id, clientId);
        return new JoinApproved(clientId, packId, sent);
    }

    /** Idempotent by target state; an approved request cannot be declined (they are a client: archive them). */
    @Transactional
    public JoinRequestItem decline(UUID trainerId, UUID tenantId, UUID id) {
        var now = repo.request(trainerId, tenantId, id).orElseThrow(JoinRequestService::notFound);
        if ("approved".equals(now.status())) {
            throw ApiException.conflict("JOIN_REQUEST_DECIDED", "You approved this request already. To end it, archive the client.");
        }
        if ("pending".equals(now.status())) repo.decline(trainerId, tenantId, id);
        return repo.request(trainerId, tenantId, id).orElseThrow(JoinRequestService::notFound);
    }

    private static ApiException notFound() {
        return ApiException.notFound("That request is not on your list.");
    }
}
