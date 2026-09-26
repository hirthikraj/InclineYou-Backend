package com.inclineyou.inclineyou_backend.trainer.profile;

import com.inclineyou.inclineyou_backend.entity.AppUser;
import com.inclineyou.inclineyou_backend.entity.Trainer;
import com.inclineyou.inclineyou_backend.entity.TrainerBusiness;
import com.inclineyou.inclineyou_backend.repository.AppUserRepository;
import com.inclineyou.inclineyou_backend.repository.TrainerBusinessRepository;
import com.inclineyou.inclineyou_backend.repository.TrainerRepository;
import com.inclineyou.inclineyou_backend.trainer.account.AccountRuleException;
import com.inclineyou.inclineyou_backend.trainer.links.SocialLink;
import com.inclineyou.inclineyou_backend.trainer.links.YouTubeLink;
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
 * Every field on {@link UpdateRequest} is nullable and means "leave it alone".
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

    /**
     * The identity caps — V33. Held here rather than in the column, so raising
     * one is a line of Java and not a migration under the additive-only law.
     *
     * 80 characters is one line beside an avatar at every width the two halves
     * draw ("Strength & fat-loss coach · Indiranagar" is 39). 1200 comfortably
     * fits the 200 words the bio asks for, at the ~6 characters a word runs to.
     */
    private static final int MAX_HEADLINE = 80;
    private static final int MAX_BIO = 1200;

    /**
     * `map_link` — V34. Refused rather than truncated, for the same reason as
     * the two above and one more: a URL cut at its 500th character is not a
     * shortened link, it is a broken one, and 200 OK on a link that no longer
     * opens is the worst of the three outcomes.
     *
     * 500 is generous on purpose. A Google Maps share URL with a place id and a
     * plus code runs to about 200; the long form with coordinates and a
     * `data=` blob is longer still, and cutting one is exactly what must not
     * happen.
     */
    private static final int MAX_MAP_LINK = 500;

    /**
     * The social links — V35. The same 500 as the map link, and for the same
     * reason: what arrives here is a PASTE, share token and all, and it is only
     * after {@link SocialLink} has reduced it that the stored string is short.
     * Refusing rather than truncating matters more here than anywhere, because
     * a canonicaliser handed a cut URL does not fail — it reads the shortened
     * handle as a real one and stores a link to somebody else's account.
     */
    private static final int MAX_SOCIAL_LINK = 500;

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
            String gymName,
            Map<String, Object> preferences,
            /* ---- identity (V33). Null means never answered. ---- */
            String headline,
            String bio,
            /** Canonical watch URL. */
            String introVideoUrl,
            /**
             * The 11-character id out of {@code introVideoUrl}, derived not
             * stored. It is on the wire so a card that wants a thumbnail or an
             * `<iframe>` does not re-implement the parse in TypeScript — which
             * is the same argument that put `label` and `variables` on the
             * nudge-template wire rather than in a copy on each half.
             */
            String introVideoId,
            /* ---- where and how (V34). Null / empty means never answered. ---- */
            /** Verbatim, as pasted. Not canonicalised — see V34. */
            String mapLink,
            List<String> trainingModes,
            List<String> serviceAreas,
            /* ---- where to look (V35). Null means never answered. ---- */
            /** Canonical profile URL. */
            String instagramUrl,
            /** Canonical CHANNEL URL — not a video. */
            String youtubeUrl,
            /**
             * {@code @handle} out of whichever of the two is set, derived not
             * stored — on the wire for the same reason {@code introVideoId} is,
             * so a card that wants to render the handle rather than the URL does
             * not re-implement the parse. Null for a {@code /channel/UC…} URL,
             * which genuinely has no handle to show.
             */
            String instagramHandle,
            String youtubeHandle,
            /* ---- the account (V36). Null means never answered. ---- */
            /**
             * A contact address, not a login. Appended LAST, like every field
             * before it, because a response field's position is part of the
             * additive contract every older build reads by name.
             */
            String email,
            /* ---- V6. Null means never asked; "undisclosed" is an answer. ---- */
            String gender
    ) {}

    public record UpdateRequest(
            String name,
            String upiVpa,
            String experienceBand,
            List<String> specialities,
            List<String> certifications,
            List<String> languages,
            Boolean completeSetup,
            String gymName,
            Map<String, Object> preferences,
            /* ---- identity (V33). Null leaves alone; "" clears. ---- */
            String headline,
            String bio,
            /** Any YouTube shape; stored canonical. "" clears. */
            String introVideoUrl,
            /* ---- where and how (V34). Null leaves alone; "" / [] clears. ---- */
            String mapLink,
            List<String> trainingModes,
            List<String> serviceAreas,
            /* ---- where to look (V35). Null leaves alone; "" clears. ---- */
            /** A profile URL or a bare {@code @handle}; stored canonical. */
            String instagramUrl,
            /** A channel URL or a bare {@code @handle}; stored canonical. */
            String youtubeUrl,
            /* ---- the account (V36). Null leaves alone; "" clears. ---- */
            /**
             * A contact address. Checked for shape only — there is nothing in
             * this backend that could send to it and therefore nothing that
             * could verify it, and a screen that claimed otherwise would be
             * making a promise the product cannot keep.
             */
            String email,
            /* ---- V6. Null leaves alone; "" clears; otherwise one of GENDERS. ---- */
            String gender
    ) {}

    public TrainerResponse get(UUID trainerId) {
        return toResponse(load(trainerId), loadBusiness(trainerId));
    }

    @Transactional
    public TrainerResponse update(UUID trainerId, UpdateRequest req) {
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
        if (req.gymName() != null) {
            b.setGymName(req.gymName().isBlank() ? null : trim(req.gymName(), 120));
        }
        // `trainer_business_gym_needs_floor` refuses a gym name whose training
        // modes don't include `gym_floor` — checked here so the trainer gets a
        // sentence rather than a raw constraint violation from the UPDATE below.
        if (b.getGymName() != null
                && (b.getTrainingModes() == null || !b.getTrainingModes().contains("gym_floor"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "gymName: trainingModes must include gym_floor");
        }
        if (req.headline() != null) {
            b.setHeadline(req.headline().isBlank() ? null : bounded(req.headline(), MAX_HEADLINE, "headline"));
        }
        if (req.bio() != null) {
            b.setBio(req.bio().isBlank() ? null : bounded(req.bio(), MAX_BIO, "bio"));
        }
        if (req.introVideoUrl() != null) {
            b.setIntroVideoUrl(req.introVideoUrl().isBlank() ? null : canonicalVideo(req.introVideoUrl()));
        }
        if (req.mapLink() != null) {
            b.setMapLink(req.mapLink().isBlank() ? null : mapLink(req.mapLink()));
        }
        if (req.instagramUrl() != null) {
            b.setInstagramUrl(req.instagramUrl().isBlank() ? null : instagram(req.instagramUrl()));
        }
        if (req.youtubeUrl() != null) {
            b.setYoutubeUrl(req.youtubeUrl().isBlank() ? null : youtubeChannel(req.youtubeUrl()));
        }
        if (req.preferences() != null) mergePrefs(t, req.preferences());

        Trainer saved = repo.save(t);
        TrainerBusiness savedBusiness = businessRepo.save(b);
        return toResponse(saved, savedBusiness);
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
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, field + ": at most " + MAX_LIST + " entries");
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
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "preferences: at most " + MAX_PREFS + " keys");
        }

        metadata.put(PREFS_KEY, prefs);
        t.setMetadata(new HashMap<>(metadata));
    }

    private String trim(String value, int max) {
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
    }

    /**
     * Like {@link #trim} but it REFUSES instead of truncating, and the
     * difference is deliberate.
     *
     * Everywhere above, an over-long value is silently cut: a 130-character name
     * or UPI id is a paste accident, and the tail carries nothing. A bio is
     * prose somebody wrote, and quietly dropping its last sentence — while
     * answering 200 OK and echoing back a profile that looks saved — is the
     * worst of the three possible outcomes. Both halves cap the field in the UI
     * anyway, so anything arriving here over the limit did not come from a
     * screen and deserves to be told.
     */
    private String bounded(String value, int max, String field) {
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, field + ": at most " + max + " characters");
        }
        return trimmed;
    }

    private String canonicalVideo(String raw) {
        try {
            return YouTubeLink.canonicalise(raw);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "introVideoUrl: must be a YouTube link");
        }
    }

    /**
     * A map link, checked for being a link and nothing else.
     *
     * There is no `MapLink.java` beside {@link YouTubeLink} and there should not
     * be one. A YouTube URL has a single canonical form and one field that
     * matters, so reducing it is a service. A maps URL does not: the share sheet
     * emits a short `maps.app.goo.gl` redirect, the desktop bar emits a long
     * `/maps/place/...@lat,lng,z/data=` string, Apple and OpenStreetMap emit
     * neither, and a parser that "normalised" any of those would eventually
     * break a link that worked. So the only thing refused here is a value that
     * is not a URL at all — a typed address, a phone number, a sentence — which
     * is the one failure a trainer would not otherwise discover until a client
     * tapped it.
     */
    private String mapLink(String raw) {
        String url = bounded(raw, MAX_MAP_LINK, "mapLink");
        String lower = url.toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "mapLink: must be a link starting http:// or https://");
        }
        return url;
    }

    private String instagram(String raw) {
        String value = bounded(raw, MAX_SOCIAL_LINK, "instagramUrl");
        try {
            return SocialLink.instagram(value);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "instagramUrl: must be an Instagram profile — instagram.com/yourname, or @yourname");
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
        String value = bounded(raw, MAX_SOCIAL_LINK, "youtubeUrl");
        try {
            return SocialLink.youtube(value);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    SocialLink.isVideo(value)
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
                t.getGender()
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
