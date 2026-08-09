package com.trainx.trainx_backend.trainer;

import com.trainx.trainx_backend.entity.Trainer;
import com.trainx.trainx_backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The trainer's own profile — everything the setup flow collects, plus the flag
 * that says whether that flow is still owed.
 *
 * Every field on {@link UpdateRequest} is nullable and means "leave it alone".
 * The app sends the whole profile in one PATCH at the end of setup, but it may
 * also send a single field later from Settings, and the two must not need
 * different endpoints. Sending an EMPTY list is a real instruction — it clears
 * that list — which is why null and empty are treated differently here.
 */
@Service
@RequiredArgsConstructor
public class TrainerService {

    /**
     * Guards against abuse, NOT the product rule. The app caps specialities at
     * five; if that cap moves to six, a phone that can't be force-updated must
     * not start failing against a server that still says five. So the server
     * limit sits well above the UI's and only exists to stop someone posting a
     * thousand entries.
     */
    private static final int MAX_LIST = 25;
    private static final int MAX_ITEM_LENGTH = 80;

    private final TrainerRepository repo;

    /**
     * `setupComplete` is derived rather than stored as a boolean so there is
     * exactly one source of truth, and so we know WHEN it happened.
     */
    public record TrainerResponse(
            String id,
            String phone,
            String name,
            String upiVpa,
            String experienceBand,
            List<String> specialities,
            List<String> certifications,
            List<String> languages,
            boolean setupComplete,
            Instant setupCompletedAt
    ) {}

    /**
     * @param completeSetup true stamps the profile as finished. It never
     *                      un-stamps: setup happens once, and a later Settings
     *                      edit that happened to send `false` must not push the
     *                      trainer back into onboarding.
     */
    public record UpdateRequest(
            String name,
            String upiVpa,
            String experienceBand,
            List<String> specialities,
            List<String> certifications,
            List<String> languages,
            Boolean completeSetup
    ) {}

    public TrainerResponse get(UUID trainerId) {
        return toResponse(load(trainerId));
    }

    @Transactional
    public TrainerResponse update(UUID trainerId, UpdateRequest req) {
        Trainer t = load(trainerId);

        if (req.name() != null && !req.name().isBlank()) t.setName(trim(req.name(), 100));
        if (req.upiVpa() != null) t.setUpiVpa(req.upiVpa().isBlank() ? null : trim(req.upiVpa(), 100));
        if (req.experienceBand() != null) {
            // Deliberately not checked against a fixed set. A newer app sending
            // a band this build has never heard of must not get a 400 — the
            // value is only ever displayed and filtered on, so an unknown one
            // degrades gracefully instead of losing the trainer's answer.
            t.setExperienceBand(req.experienceBand().isBlank() ? null : trim(req.experienceBand(), 20));
        }
        if (req.specialities() != null) t.setSpecialities(clean(req.specialities(), "specialities"));
        if (req.certifications() != null) t.setCertifications(clean(req.certifications(), "certifications"));
        if (req.languages() != null) t.setLanguages(clean(req.languages(), "languages"));

        if (Boolean.TRUE.equals(req.completeSetup()) && t.getSetupCompletedAt() == null) {
            t.setSetupCompletedAt(Instant.now());
        }

        return toResponse(repo.save(t));
    }

    private Trainer load(UUID trainerId) {
        return repo.findById(trainerId)
                .filter(t -> t.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
    }

    /** Trims, drops blanks, de-duplicates in place, and refuses an absurd list. */
    private List<String> clean(List<String> raw, String field) {
        List<String> out = new ArrayList<>();
        for (String item : raw) {
            if (item == null || item.isBlank()) continue;
            String value = trim(item, MAX_ITEM_LENGTH);
            if (!out.contains(value)) out.add(value);
        }
        if (out.size() > MAX_LIST) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, field + ": at most " + MAX_LIST + " entries");
        }
        return out;
    }

    private String trim(String value, int max) {
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    private TrainerResponse toResponse(Trainer t) {
        return new TrainerResponse(
                t.getId().toString(),
                t.getPhone(),
                t.getName(),
                t.getUpiVpa(),
                t.getExperienceBand(),
                orEmpty(t.getSpecialities()),
                orEmpty(t.getCertifications()),
                orEmpty(t.getLanguages()),
                t.getSetupCompletedAt() != null,
                t.getSetupCompletedAt()
        );
    }

    /** Rows written before V8 read back as null, not as an empty array. */
    private List<String> orEmpty(List<String> value) {
        return value == null ? List.of() : value;
    }
}
