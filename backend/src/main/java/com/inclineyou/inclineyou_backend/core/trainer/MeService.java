package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.trainer.dto.MeResponse;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import com.inclineyou.inclineyou_backend.core.tenant.TenantJdbcRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * {@code GET /v1/me} — the shell's own read, on every screen. See
 * {@code api-contract.html#today-l1}.
 *
 * <p>Deliberately its own service rather than a second method on
 * {@link TrainerService}: that one is the setup/profile PATCH target, one
 * request shaped around "leave alone unless told otherwise". This is a
 * read-only projection across three tables — {@code trainer},
 * {@code trainer_business} and the active {@code tenant} — for the session
 * check and the workspace banner every page needs, and conflating the two
 * would make a future field on one leak onto the wire of the other.
 */
@Service
@RequiredArgsConstructor
public class MeService {

    private final TrainerRepository trainerRepo;
    private final AppUserRepository appUserRepo;
    private final TrainerBusinessRepository businessRepo;
    private final TenantJdbcRepository tenants;
    private final GymPlaceJdbcRepository gymPlaces;


    public MeResponse get(UUID trainerId) {
        Trainer t = trainerRepo.findById(trainerId)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        AppUser user = appUserRepo.findById(t.getAppUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        var business = businessRepo.findById(trainerId);
        String gymName = business.map(TrainerBusiness::getGymName).orElse(null);
        var gymPlace = business.map(TrainerBusiness::getGymPlaceId).flatMap(gymPlaces::find).orElse(null);

        // The ACTIVE workspace, not the home one — a trainer who switched
        // stays switched on every later /v1/me until they switch back. Set by
        // AuthTokenFilter for every trainer-authenticated request; empty only
        // when a token predates tenancy and the trainer has since lost their
        // last live membership, which CurrentScope.require() turns into a
        // clear 422 rather than a null workspace on the wire.
        UUID tenantId = CurrentScope.require().activeTenantId();

        return new MeResponse(
                t.getId().toString(),
                t.getName(),
                user.getPhone(),
                t.getSetupCompletedAt() == null ? null : t.getSetupCompletedAt().toEpochMilli(),
                gymName,
                tenants.workspace(tenantId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace not found")),
                gymPlace);
    }
}
