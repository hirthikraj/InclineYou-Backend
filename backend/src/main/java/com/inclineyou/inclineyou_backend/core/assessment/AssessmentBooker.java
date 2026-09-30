package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Puts one open assessment on the books from a template. Four routes do it — a
 * one-off, a new cycle's first, the next one after a finish, and the next one
 * after a delete — and each must copy the form the same way.
 */
@Component
@RequiredArgsConstructor
class AssessmentBooker {

    private final AssessmentJdbcRepository assessments;

    /**
     * @param scheduleId the cycle it belongs to, or null for a one-off
     * @param id         the caller's id (a create's safe-retry key), or null to mint one
     * @return the new assessment's id
     * @throws ApiException 409 {@code ID_CONFLICT} when {@code id} is somebody else's
     */
    UUID book(UUID trainerId, UUID clientId, AssessmentTemplateJdbcRepository.Stored tpl,
              UUID scheduleId, LocalDate dueOn, UUID id) {
        UUID made = id == null ? UUID.randomUUID() : id;
        String form = AssessmentJson.write(AssessmentForms.copyOf(tpl));
        if (!assessments.insert(made, trainerId, clientId, tpl.id(), scheduleId, tpl.name(), form, dueOn)) {
            throw ApiException.idConflict();
        }
        return made;
    }
}
