package com.inclineyou.inclineyou_backend.core.trainer;

import com.inclineyou.inclineyou_backend.core.auth.AppUser;
import com.inclineyou.inclineyou_backend.core.auth.AppUserRepository;
import com.inclineyou.inclineyou_backend.core.trainer.dto.GymPlaceInput;
import com.inclineyou.inclineyou_backend.core.trainer.dto.TrainerResponse;
import com.inclineyou.inclineyou_backend.core.trainer.dto.UpdateTrainerRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
 * Every field on {@link UpdateTrainerRequest} is nullable and means "leave it alone".
 * The app sends the whole profile in one PATCH at the end of setup, but it may
 * also send a single field later from Settings, and the two must not need
 * different endpoints. Sending an EMPTY list is a real instruction — it clears
 * that list — which is why null and empty are treated differently here.
 *
 * <p>Reads and writes span two tables since the 25 Sep 2026 schema rebuild:
 * {@code trainer} (identity — name, email, gender, setup state) and
 * {@code trainer_business} (everything a client reads — certifications, the
 * gym arrangement, social links…), one-to-one by {@code trainer_id} and kept
 * in existence by a database trigger the moment the trainer row is. This
 * class is the one place that still hides the split: one request, one
 * response, same as before.
 */
@Service
@RequiredArgsConstructor
public class TrainerService {


    private static final int MAX_LIST = 25;
    private static final int MAX_ITEM_LENGTH = 80;

    /** RFC 5321's ceiling on an address. V36 — refused over, never truncated. */
    private static final int MAX_EMAIL = 254;

    /**
     * The gender ids — V6. The same four as `GENDERS` in the web's
     * `lib/setup/options.ts`; the ids are what the column holds, so they cannot
     * change without changing every row already written. Refused rather than
     * stored verbatim, because a free-text answer here is a filter that misses
     * the trainer it was written by.
     */
    private static final List<String> GENDERS = List.of("woman", "man", "nonbinary", "undisclosed");

    private static final String PREFS_KEY = "prefs";
    private static final int MAX_PREFS = 60;


    private final TrainerRepository repo;
    private final TrainerBusinessRepository businessRepo;
    private final AppUserRepository appUserRepo;
    private final GymPlaceJdbcRepository gymPlaces;



    public TrainerResponse get(UUID trainerId) {
        return toResponse(load(trainerId), loadBusiness(trainerId));
    }

    @Transactional
    public TrainerResponse update(UUID trainerId, UpdateTrainerRequest req) {
        Trainer t = load(trainerId);
        TrainerBusiness b = loadBusiness(trainerId);

        if (req.name() != null && !req.name().isBlank()) t.setName(trim(req.name(), 100));
        if (req.email() != null) {
            t.setEmail(req.email().isBlank() ? null : email(req.email()));
        }
        if (req.gender() != null) {
            t.setGender(req.gender().isBlank() ? null : gender(req.gender()));
        }
        if (Boolean.TRUE.equals(req.completeSetup()) && t.getSetupCompletedAt() == null) {
            t.setSetupCompletedAt(Instant.now());
        }

        if (req.upiVpa() != null) b.setUpiVpa(req.upiVpa().isBlank() ? null : trim(req.upiVpa(), 100));
        if (req.experienceBand() != null) {
            b.setExperienceBand(req.experienceBand().isBlank() ? null : trim(req.experienceBand(), 20));
        }
        if (req.specialities() != null) b.setSpecialities(clean(req.specialities(), "specialities"));
        if (req.certifications() != null) b.setCertifications(clean(req.certifications(), "certifications"));
        if (req.languages() != null) b.setLanguages(clean(req.languages(), "languages"));
        if (req.trainingModes() != null) b.setTrainingModes(clean(req.trainingModes(), "trainingModes"));
        if (req.serviceAreas() != null) b.setServiceAreas(clean(req.serviceAreas(), "serviceAreas"));
        if (req.gymName() != null && req.gymPlace() != null) {
            throw ApiException.validation("gymName and gymPlace: send one — a picked gym names itself");
        }
        if (req.gymName() != null) {
            // Free text is an unlinked gym: the name no longer says which place it was.
            b.setGymName(req.gymName().isBlank() ? null : trim(req.gymName(), 120));
            b.setGymPlaceId(null);
        }
        if (req.gymPlace() != null) {
            GymPlaceInput place = req.gymPlace().value();
            if (place == null) {
                b.setGymPlaceId(null);
                b.setGymName(null);
            } else {
                place = cleanPlace(place);
                String before = b.getGymName();
                UUID id = gymPlaces.upsert(place);
                b.setGymPlaceId(id);
                b.setGymName(place.name());
                gymPlaces.adoptUnlinked(trainerId, id, before, place.name());
            }
        }
        // `trainer_business_gym_needs_floor` refuses a gym name whose training
        // modes don't include `gym_floor` — checked here so the trainer gets a
        // sentence rather than a raw constraint violation from the UPDATE below.
        if (b.getGymName() != null
                && (b.getTrainingModes() == null || !b.getTrainingModes().contains("gym_floor"))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "GYM_NEEDS_FLOOR", "gymName: trainingModes must include gym_floor");
        }
        if (req.headline() != null) {
            b.setHeadline(req.headline().isBlank() ? null : req.headline());
        }
        if (req.bio() != null) {
            b.setBio(req.bio().isBlank() ? null : req.bio());
        }
        if (req.introVideoUrl() != null) {
            b.setIntroVideoUrl(req.introVideoUrl().isBlank() ? null : canonicalVideo(req.introVideoUrl()));
        }
        if (req.mapLink() != null) {
            b.setMapLink(req.mapLink().isBlank() ? null : req.mapLink());
        }
        if (req.instagramUrl() != null) {
            b.setInstagramUrl(req.instagramUrl().isBlank() ? null : instagram(req.instagramUrl()));
        }
        if (req.youtubeUrl() != null) {
            b.setYoutubeUrl(req.youtubeUrl().isBlank() ? null : youtubeChannel(req.youtubeUrl()));
        }
        if (req.preferences() != null) mergePrefs(t, req.preferences());

        Trainer saved = repo.save(t);
        // Flushed, not merely saved: the place read-back below is policied by the row this writes.
        TrainerBusiness savedBusiness = businessRepo.saveAndFlush(b);
        return toResponse(saved, savedBusiness);
    }

    /** Trims, and refuses what the directory could not hold — checked here so the trainer meets a sentence. */
    private GymPlaceInput cleanPlace(GymPlaceInput in) {
        String placeId = in.placeId() == null ? "" : in.placeId().trim();
        String name = in.name() == null ? "" : in.name().trim();
        // A Google place id is URL-safe base64-ish ("ChIJ…"); the web supplies it, so refuse what could not be one.
        if (!placeId.matches("[A-Za-z0-9_-]{10,300}")) throw ApiException.validation("gymPlace.placeId: not a place id");
        if (name.isEmpty() || name.length() > 120) throw ApiException.validation("gymPlace.name: required, at most 120 characters");
        String address = blankToNull(in.address(), 400, "gymPlace.address");
        String city = blankToNull(in.city(), 80, "gymPlace.city");
        String link = blankToNull(in.mapLink(), 500, "gymPlace.mapLink");
        if (link != null && !link.matches("(?i)https?://.*")) throw ApiException.validation("gymPlace.mapLink: must be a link starting http:// or https://");
        if ((in.lat() == null) != (in.lng() == null)) throw ApiException.validation("gymPlace.lat and lng: send both or neither");
        if (in.lat() != null && (in.lat().abs().compareTo(java.math.BigDecimal.valueOf(90)) > 0
                || in.lng().abs().compareTo(java.math.BigDecimal.valueOf(180)) > 0)) {
            throw ApiException.validation("gymPlace.lat and lng: latitude within ±90 and longitude within ±180");
        }
        var lat = in.lat() == null ? null : in.lat().setScale(6, java.math.RoundingMode.HALF_UP);
        var lng = in.lng() == null ? null : in.lng().setScale(6, java.math.RoundingMode.HALF_UP);
        return new GymPlaceInput(placeId, name, address, city, lat, lng, link);
    }

    private static String blankToNull(String v, int max, String field) {
        if (v == null || v.isBlank()) return null;
        String t = v.trim();
        if (t.length() > max) throw ApiException.validation(field + ": at most " + max + " characters");
        return t;
    }

    private Trainer load(UUID trainerId) {
        return repo.findById(trainerId)
                .filter(t -> t.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Trainer not found"));
    }

    /** Always present — a database trigger inserts it the instant the trainer row is. */
    private TrainerBusiness loadBusiness(UUID trainerId) {
        return businessRepo.findById(trainerId)
                .orElseThrow(() -> new IllegalStateException(
                        "trainer_business missing for trainer " + trainerId));
    }

    private String phoneOf(Trainer t) {
        return appUserRepo.findById(t.getAppUserId())
                .map(AppUser::getPhone)
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
            throw ApiException.validation(field + ": at most " + MAX_LIST + " entries");
        }
        return out;
    }

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
            throw ApiException.validation("preferences: at most " + MAX_PREFS + " keys");
        }

        metadata.put(PREFS_KEY, prefs);
        t.setMetadata(new HashMap<>(metadata));
    }

    private String trim(String value, int max) {
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    private String canonicalVideo(String raw) {
        try {
            return YouTubeLink.canonicalise(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("introVideoUrl: must be a YouTube link");
        }
    }

    private String instagram(String raw) {
        try {
            return SocialLink.instagram(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.validation("instagramUrl: must be an Instagram profile — instagram.com/yourname, or @yourname");
        }
    }

    /**
     * A channel, and the refusal names the likely mistake.
     *
     * A trainer who pastes a watch URL here has pasted it one field too far
     * down — {@code introVideoUrl} wants exactly that string — and a generic
     * "not a YouTube channel" would leave them re-pasting the same link. This
     * is the same argument as reading the server's {@code detail} on the web:
     * the refusal a person can act on is the one that says what they did.
     */
    private String youtubeChannel(String raw) {
        try {
            return SocialLink.youtube(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.validation(SocialLink.isVideo(raw)
                            ? "youtubeUrl: that is a video, not a channel — the intro video field takes it"
                            : "youtubeUrl: must be a YouTube channel — youtube.com/@yourname");
        }
    }

    private TrainerResponse toResponse(Trainer t, TrainerBusiness b) {
        return new TrainerResponse(
                t.getId().toString(),
                phoneOf(t),
                t.getName(),
                b.getUpiVpa(),
                b.getExperienceBand(),
                orEmpty(b.getSpecialities()),
                orEmpty(b.getCertifications()),
                orEmpty(b.getLanguages()),
                t.getSetupCompletedAt() != null,
                t.getSetupCompletedAt(),
                b.getGymName(),
                prefsOf(t),
                b.getHeadline(),
                b.getBio(),
                b.getIntroVideoUrl(),
                YouTubeLink.idOf(b.getIntroVideoUrl()),
                b.getMapLink(),
                orEmpty(b.getTrainingModes()),
                orEmpty(b.getServiceAreas()),
                b.getInstagramUrl(),
                b.getYoutubeUrl(),
                SocialLink.handleOf(b.getInstagramUrl()),
                SocialLink.handleOf(b.getYoutubeUrl()),
                t.getEmail(),
                t.getGender(),
                gymPlaces.find(b.getGymPlaceId()).orElse(null)
        );
    }

    /** One of {@link #GENDERS}, compared case-insensitively and stored lower-case. */
    private String gender(String raw) {
        String value = raw.trim().toLowerCase();
        if (!GENDERS.contains(value)) throw AccountRuleException.genderUnknown();
        return value;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> prefsOf(Trainer t) {
        var metadata = t.getMetadata();
        if (metadata == null) return Map.of();
        var prefs = metadata.get(PREFS_KEY);
        return (prefs instanceof Map<?, ?> m) ? (Map<String, Object>) m : Map.of();
    }

    /**
     * An address, checked for shape and nothing else.
     *
     * <p>Three rules, and the restraint is the point: one {@code @}, something
     * on each side of it, and a dot in the domain. There is no attempt at RFC
     * 5322 — a regex that tries costs several hundred characters, still gets
     * quoted local parts wrong, and rejects addresses that work. **The only
     * check that ever settles an address is sending to it**, and this backend
     * cannot send, so the honest ceiling on what we may claim is "that is not
     * an address at all".
     *
     * <p>Refused over the cap rather than truncated, like {@code headline} and
     * {@code bio} and unlike every other string on this endpoint: half an
     * address is not a shorter address, it is a wrong one, and a silent
     * truncation would store a plausible-looking string that reaches nobody.
     *
     * <p>Both refusals are {@link AccountRuleException} rather than {@code
     * ResponseStatusException}, and that is not a style choice — this service
     * sets no {@code spring.mvc.problemdetails.enabled}, so a {@code
     * ResponseStatusException} serialises through the servlet error page as
     * {@code {timestamp, status, error, path}} and the sentence reaches the log
     * and never the trainer.
     */
    private String email(String raw) {
        String value = raw.trim();
        if (value.length() > MAX_EMAIL) throw AccountRuleException.emailTooLong(MAX_EMAIL);
        int at = value.indexOf('@');
        if (at <= 0
                || at != value.lastIndexOf('@')
                || at == value.length() - 1
                || value.indexOf('.', at) < 0
                || value.endsWith(".")
                || value.chars().anyMatch(Character::isWhitespace)) {
            throw AccountRuleException.emailNotAnAddress();
        }
        return value;
    }

    private List<String> orEmpty(List<String> value) {
        return value == null ? List.of() : value;
    }
}
