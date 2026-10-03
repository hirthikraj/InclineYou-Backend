package com.inclineyou.inclineyou_backend.core.trainer.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import com.inclineyou.inclineyou_backend.shared.wire.Patch;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * {@code PATCH /v1/trainers/me}. Every field is nullable and means "leave it
 * alone"; {@code ""} clears a string and {@code []} clears a list. That already
 * carries all three states without {@code Patch<T>}, because an empty answer is
 * never a value any of these fields may hold.
 */
public record UpdateTrainerRequest(
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
        @Size(max = 80, message = "at most 80 characters") String headline,
        @Size(max = 1200, message = "at most 1200 characters") String bio,
        /** Any YouTube shape; stored canonical. "" clears. */
        String introVideoUrl,
        /* ---- where and how (V34). Null leaves alone; "" / [] clears. ---- */
        @Size(max = 500, message = "at most 500 characters")
        @Pattern(regexp = "(?i)(https?://.*)?", message = "must be a link starting http:// or https://") String mapLink,
        List<String> trainingModes,
        List<String> serviceAreas,
        /* ---- where to look (V35). Null leaves alone; "" clears. ---- */
        /** A profile URL or a bare {@code @handle}; stored canonical. */
        @Size(max = 500, message = "at most 500 characters") String instagramUrl,
        /** A channel URL or a bare {@code @handle}; stored canonical. */
        @Size(max = 500, message = "at most 500 characters") String youtubeUrl,
        /* ---- the account (V36). Null leaves alone; "" clears. ---- */
        /**
         * A contact address. Checked for shape only — there is nothing in
         * this backend that could send to it and therefore nothing that
         * could verify it, and a screen that claimed otherwise would be
         * making a promise the product cannot keep.
         */
        String email,
        /* ---- V6. Null leaves alone; "" clears; otherwise one of GENDERS. ---- */
        String gender,
        /* ---- V8. Absent leaves alone; null clears (gym name too); a value links the gym. ---- */
        /**
         * The gym picked from the place search. {@code gymName} alone stays free text and
         * unlinks; sending both is refused, because they disagree about who wins.
         */
        Patch<GymPlaceInput> gymPlace
) {
    /**
     * The five capped fields are REFUSED over their cap (V33–V35), measured
     * after trimming as they are stored; every other string on this route is
     * silently truncated by the service. The difference is deliberate:
     *
     * <ul>
     *   <li>a 130-character name is a paste accident, but a bio is prose, and
     *       dropping its last sentence while answering 200 is the worst outcome;</li>
     *   <li>a URL cut at its 500th character is not a shorter link, it is a
     *       broken one — and a social-link canonicaliser handed a cut URL does
     *       not fail, it reads the shortened handle as a real one and stores a
     *       link to somebody else's account;</li>
     *   <li>500 is generous on purpose: what arrives is a paste, share token and
     *       all (a Maps link with a {@code data=} blob runs long).</li>
     * </ul>
     *
     * 80 is one line beside an avatar; 1200 fits the 200 words the bio asks for.
     * {@code mapLink} is otherwise stored verbatim — a maps URL has no single
     * canonical shape, so the only refusal is a value that is not a link at all.
     */
    public UpdateTrainerRequest {
        headline = Text.strip(headline);
        bio = Text.strip(bio);
        mapLink = Text.strip(mapLink);
        instagramUrl = Text.strip(instagramUrl);
        youtubeUrl = Text.strip(youtubeUrl);
    }
}
