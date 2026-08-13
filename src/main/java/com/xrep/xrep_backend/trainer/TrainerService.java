package com.xrep.xrep_backend.trainer;

import com.xrep.xrep_backend.entity.Trainer;
import com.xrep.xrep_backend.repository.TrainerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
            Instant setupCompletedAt,
            /* Screen 06 · money. Null gym name means no gym, which is not the
               same as a 0% cut — one hides the "your share" line entirely, the
               other claims an arrangement that keeps all of it. */
            String gymName,
            BigDecimal gymSharePercent,
            /* Screens 07–16 · settings. An open map rather than a column per
               switch — see `prefs` below. */
            Map<String, Object> preferences
    ) {}

    /**
     * @param completeSetup true stamps the profile as finished. It never
     *                      un-stamps: setup happens once, and a later Settings
     *                      edit that happened to send `false` must not push the
     *                      trainer back into onboarding.
     * @param preferences   merged key by key, not replaced. Settings sends one
     *                      switch at a time and must not blank the other eight;
     *                      a key set to null is a deletion.
     */
    public record UpdateRequest(
            String name,
            String upiVpa,
            String experienceBand,
            List<String> specialities,
            List<String> certifications,
            List<String> languages,
            Boolean completeSetup,
            String gymName,
            BigDecimal gymSharePercent,
            Map<String, Object> preferences
    ) {}

    /**
     * Where the settings switches live: `trainer.metadata.prefs`.
     *
     * Not a column each. There are nine notification switches, a chase window, a
     * default reminder tone and a QR toggle, all of them small, all of them
     * additive, and every one of them would otherwise be a migration — which is
     * exactly what V8 added the metadata bag to avoid. The phone is the source
     * of truth for its own UI and writes these through opportunistically; the
     * server needs them because push decisions are made server-side, and a
     * notification switch that only exists on the device it was flipped on is a
     * switch that does nothing.
     *
     * Untyped on purpose. A newer app storing a preference this build has never
     * heard of must round-trip it rather than get a 400.
     */
    private static final String PREFS_KEY = "prefs";

    /** Enough for every switch the design defines, several times over. */
    private static final int MAX_PREFS = 60;

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

        // An empty gym name is a real instruction — the trainer left the gym —
        // and it clears the percentage with it, so the app can never show a
        // share of nothing.
        if (req.gymName() != null) {
            if (req.gymName().isBlank()) {
                t.setGymName(null);
                t.setGymSharePercent(null);
            } else {
                t.setGymName(trim(req.gymName(), 120));
            }
        }
        if (req.gymSharePercent() != null) {
            var pct = req.gymSharePercent();
            if (pct.signum() < 0 || pct.compareTo(BigDecimal.valueOf(100)) > 0) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "gymSharePercent: must be between 0 and 100");
            }
            t.setGymSharePercent(pct);
        }

        if (req.preferences() != null) mergePrefs(t, req.preferences());

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

    /**
     * Merges one patch of preferences into the bag.
     *
     * A whole-map replace would be wrong: the Notifications screen flips one
     * switch and sends one key, and replacing would silently turn the other
     * eight back to their defaults. A null value is the one way to remove a key,
     * which is how a trainer goes back to "follow the phone".
     */
    @SuppressWarnings("unchecked")
    private void mergePrefs(Trainer t, Map<String, Object> patch) {
        var metadata = t.getMetadata();
        if (metadata == null) {
            metadata = new HashMap<>();
            t.setMetadata(metadata);
        }

        var existing = metadata.get(PREFS_KEY);
        var prefs = (existing instanceof Map<?, ?> m)
                ? new HashMap<String, Object>((Map<String, Object>) m)
                : new HashMap<String, Object>();

        patch.forEach((key, value) -> {
            if (key == null || key.isBlank()) return;
            if (value == null) prefs.remove(key);
            else prefs.put(trim(key, 60), value);
        });

        if (prefs.size() > MAX_PREFS) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "preferences: at most " + MAX_PREFS + " keys");
        }

        metadata.put(PREFS_KEY, prefs);
        // Hibernate compares JSON columns by reference for dirty checking, so a
        // mutated-in-place map can be saved without ever being written. A fresh
        // instance is what guarantees the UPDATE happens.
        t.setMetadata(new HashMap<>(metadata));
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
                t.getSetupCompletedAt(),
                t.getGymName(),
                t.getGymSharePercent(),
                prefsOf(t)
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> prefsOf(Trainer t) {
        var metadata = t.getMetadata();
        if (metadata == null) return Map.of();
        var prefs = metadata.get(PREFS_KEY);
        return (prefs instanceof Map<?, ?> m) ? (Map<String, Object>) m : Map.of();
    }

    /** Rows written before V8 read back as null, not as an empty array. */
    private List<String> orEmpty(List<String> value) {
        return value == null ? List.of() : value;
    }
}
