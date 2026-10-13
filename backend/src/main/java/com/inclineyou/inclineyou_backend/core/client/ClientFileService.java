package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.ClientDetail;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * api-contract 1.1 Client file — the header every tab draws ({@code GET /v1/clients/{id}}). There is no measurement
 * history here: a body is measured in an assessment and nowhere else, so the client file's measurements are the
 * assessments' own (the {@code GET /v1/assessments} reads), and {@code GET /v1/clients/{id}/readings} was removed.
 */
@Service
@RequiredArgsConstructor
public class ClientFileService {

    private final ClientJdbcRepository clients;
    private final ClientNoteJdbcRepository notes;
    private final ClientSummaryService summaries;

    /** An archived client still opens; 404 only when not yours. */
    public ClientDetail get(UUID trainerId, UUID clientId) {
        var summary = summaries.one(trainerId, clientId)
                .orElseThrow(() -> ApiException.notFound("That client is not on your roster."));
        var own = clients.ownFields(clientId);
        summary = summary.withPortal(summary.portal().withExtras(clients.portalExtras(clientId)));
        return new ClientDetail(summary, own.dateOfBirth(), own.heightCm(), own.activityLevel(), own.goal(),
                notes.pinned(clientId));
    }

    void requireOwned(UUID trainerId, UUID clientId) {
        if (!clients.isOwned(trainerId, clientId)) throw ApiException.notFound("That client is not on your roster.");
    }
}
