package com.inclineyou.inclineyou_backend.core.program;

import com.inclineyou.inclineyou_backend.core.client.ClientNoticeJdbcRepository;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * {@code POST /v1/programs/{id}/notify} — tell the client their plan changed (api-contract 1.2, tr-a11).
 *
 * <p><b>The trainer chooses.</b> Saving a plan never notifies by itself, on any route: a trainer fixing a typo, building a
 * week over a few sittings or trying a change they may undo must not send the client a notice each time. This is the one
 * door, and it is a button the trainer presses once they mean it. Each call is one notice; the screen shows it sent.
 *
 * <p>It writes a {@code plan} notice through {@code mint_client_notification()}, which applies the client's own switch
 * ({@code notify_program_updated}): a client who turned plan notices off is told nothing and the call is still a success,
 * because what the trainer did, they did. The answer says which it was ({@code sent}), so the screen never claims a client will
 * see something that was not written.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProgramNotifyService {

    private final ProgramJdbcRepository programs;
    private final ClientNoticeJdbcRepository notices;

    /** @return whether a notice was written: false when the client has plan notices switched off, or is paused */
    @Transactional
    public boolean notifyClient(UUID trainerId, UUID programId) {
        var plan = programs.notifyTarget(trainerId, programId)
                .orElseThrow(() -> ApiException.notFound("That program is not yours."));
        if (plan.clientId() == null) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PROGRAM_IS_TEMPLATE",
                    "A template has no client to tell. Only a client's plan does.");
        }
        // A paused client is still on the portal (they can't open it yet, and are not told); anyone who never joined, or left, is not.
        if (!"accepted".equals(plan.membershipStatus()) && !"paused".equals(plan.membershipStatus())) {
            throw ApiException.conflict("CLIENT_NOT_ON_PORTAL", "They haven’t joined the portal yet, so there is nobody to tell.");
        }
        boolean sent = notices.mint(UUID.fromString(plan.clientId()), "plan", "Your plan, " + plan.name().strip() + ", was updated.", null);
        log.info("plan notice trainer={} program={} sent={}", trainerId, programId, sent);
        return sent;
    }
}
