package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.trainer.dto.MeResponse;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * {@code GET /v1/me} — the shell's own read, on every screen. See
 * {@code api-contract-v1.2.html#today-l1}.
 *
 * <p>Deliberately its own service rather than a second method on
 * {@link TrainerService}: that one is the setup/profile PATCH target, one
 * request shaped around "leave alone unless told otherwise". This is a
 * read-only projection across {@code trainer}, {@code app_user},
 * {@code trainer_business}, {@code gym_place} and the active {@code tenant} —
 * one statement, {@link MeJdbcRepository} — for the session check and the
 * workspace banner every page needs, and conflating the two would make a
 * future field on one leak onto the wire of the other.
 */
@Service
@RequiredArgsConstructor
public class MeService {

    private final MeJdbcRepository repo;

    public MeResponse get(UUID trainerId) {
        // The ACTIVE workspace, not the home one — a trainer who switched
        // stays switched on every later /v1/me until they switch back. Set by
        // AuthTokenFilter for every trainer-authenticated request. Read without
        // requiring it yet: a closed account has no live membership either, and
        // must answer 401 rather than NO_WORKSPACE.
        var scope = CurrentScope.get();
        UUID tenantId = scope == null ? null : scope.activeTenantId();

        // A closed account is 401 SESSION_REVOKED, not 404: the phone's 7-day JWT
        // is self-contained and still verifies after a close, and this is the read
        // the shell checks its session with — a code-less 404 left it nothing to
        // sign out on. Same answer and sentence as AuthService#alreadyTrainer.
        var row = repo.find(trainerId, tenantId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_REVOKED",
                        "This account is closed."));

        // A live trainer with no workspace (a token that predates tenancy, and the
        // last membership since lost): the clear 422 CurrentScope.require() gives.
        if (tenantId == null) CurrentScope.require();
        if (row.workspace() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace not found");
        }
        return new MeResponse(row.id(), row.name(), row.phone(), row.setupCompletedAt(), row.gymName(),
                row.workspace(), row.gymPlace());
    }
}
