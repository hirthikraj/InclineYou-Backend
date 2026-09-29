package com.inclineyou.inclineyou_backend.core.trainer.profile;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.trainer.Trainer;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerBusiness;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerBusinessRepository;
import com.inclineyou.inclineyou_backend.core.trainer.TrainerRepository;
import com.inclineyou.inclineyou_backend.core.tenant.CurrentScope;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
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
    private final NamedParameterJdbcTemplate jdbc;

    public record Workspace(String id, String name, String currency, String country, String timezone) {}

    public record MeResponse(
            String id,
            String name,
            String phone,
            /**
             * Null until setup is done — the redirect signal. Epoch ms since 1.1,
             * like every other instant on the wire (it was an ISO string in 1.0).
             */
            Long setupCompletedAt,
            String gymName,
            Workspace workspace
    ) {}

    public MeResponse get(UUID trainerId) {
        Trainer t = trainerRepo.findById(trainerId)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        AppUser user = appUserRepo.findById(t.getAppUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
        String gymName = businessRepo.findById(trainerId).map(TrainerBusiness::getGymName).orElse(null);

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
                loadWorkspace(tenantId));
    }

    private Workspace loadWorkspace(UUID tenantId) {
        var rows = jdbc.queryForList("""
                SELECT id::text AS id, name, currency, country, timezone
                FROM tenant WHERE id = :id::uuid
                """, Map.of("id", tenantId.toString()));
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Workspace not found");
        }
        var r = rows.getFirst();
        return new Workspace(
                (String) r.get("id"), (String) r.get("name"),
                (String) r.get("currency"), (String) r.get("country"), (String) r.get("timezone"));
    }
}
