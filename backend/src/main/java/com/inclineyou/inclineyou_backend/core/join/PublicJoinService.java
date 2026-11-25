package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.auth.dto.OtpRequested;
import com.inclineyou.inclineyou_backend.core.auth.dto.SendOtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpAbuseGuard;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpRequest;
import com.inclineyou.inclineyou_backend.core.auth.otp.OtpService;
import com.inclineyou.inclineyou_backend.core.invite.dto.InviteCard;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinCard;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinCodeRequest;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinQuestion;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinSubmitRequest;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinSubmitted;
import com.inclineyou.inclineyou_backend.core.tenant.TenantContext;
import com.inclineyou.inclineyou_backend.core.tenant.WorkspaceClock;
import com.inclineyou.inclineyou_backend.core.trainer.SocialLink;
import com.inclineyou.inclineyou_backend.core.trainer.YouTubeLink;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The public join page (api-contract 1.2, jn-a1…jn-a3): read the card, send a code, ask to join. No session anywhere: the
 * code is the proof that the number is the asker's, and a request is all that can come of it — never an account.
 *
 * <p>The order of refusals mirrors the invite's: a link that is not open first (one answer for every reason), then what the
 * person said about themselves, and only then anything that spends a code.
 */
@Service
@RequiredArgsConstructor
public class PublicJoinService {

    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    private static final java.util.regex.Pattern PHONE = java.util.regex.Pattern.compile(SendOtpRequest.PHONE_PATTERN);

    private final JoinJdbcRepository repo;
    private final OtpService otp;
    private final OtpAbuseGuard abuse;
    private final AppProperties props;

    public JoinCard card(String slug) {
        if (!wellFormed(slug)) return JoinCard.closed();
        JsonNode c = repo.card(slug.toLowerCase(Locale.ROOT));
        if (!"open".equals(c.path("state").asString())) return JoinCard.closed();
        JsonNode t = c.path("trainer");
        var trainer = new InviteCard.Trainer(text(t, "name"), text(t, "headline"), text(t, "bio"),
                YouTubeLink.idOf(text(t, "intro_video_url")), list(t.path("certifications")), list(t.path("specialities")),
                list(t.path("languages")), SocialLink.handleOf(text(t, "instagram_url")), SocialLink.handleOf(text(t, "youtube_url")));
        var plans = new ArrayList<JoinCard.Plan>();
        for (JsonNode p : c.path("plans")) {
            plans.add(new JoinCard.Plan(p.path("id").asString(), p.path("name").asString(), p.path("service").asString(),
                    p.path("basis").asString(), p.path("sessions").isNumber() ? p.path("sessions").asInt() : null,
                    p.path("validity_days").isNumber() ? p.path("validity_days").asInt() : null,
                    p.path("amount").decimalValue().setScale(2, java.math.RoundingMode.HALF_UP).toPlainString(),
                    p.path("currency").asString()));
        }
        List<JoinQuestion> questions = JoinJdbcRepository.questions(c.path("questions").toString());
        return new JoinCard("open", text(c, "welcome_line"), questions, plans, c.path("allow_no_plan").asBoolean(true), trainer,
                props.getPrivacy().getPolicyVersion(), props.getPrivacy().getInviteSummary());
    }

    /** Send the code. The guard runs last, once the request is known good, as the invite's does (21 Nov 2026). */
    public OtpRequested sendCode(String slug, JoinCodeRequest req, String ip) {
        if (!wellFormed(slug) || !"open".equals(repo.card(slug.toLowerCase(Locale.ROOT)).path("state").asString())) throw closed();
        String phone = phone(req.phone());
        checkDateAndNotice(req.dateOfBirth(), req.policyVersion());
        abuse.beforeSend(ip, phone);
        var issued = otp.send(phone, OtpRequest.SIGN_IN);
        return new OtpRequested(issued.requestId().toString(), issued.expiresAt().toEpochMilli(), issued.resendAfterSeconds(), false);
    }

    /** Ask to join: the code, then the request, made with the proved number as the database's idea of who is asking. */
    public JoinSubmitted submit(String slug, JoinSubmitRequest req) {
        if (!wellFormed(slug)) throw closed();
        JsonNode card = repo.card(slug.toLowerCase(Locale.ROOT));
        if (!"open".equals(card.path("state").asString())) throw closed();
        if (!Boolean.TRUE.equals(req.trainingTerms())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "TRAINING_TERMS_REQUIRED",
                    "trainingTerms: tick that you're fit to train and accept your trainer's coaching terms.");
        }
        String phone = phone(req.phone());
        checkDateAndNotice(req.dateOfBirth(), req.policyVersion());
        String name = Text.orNull(Text.strip(req.name()));
        if (name == null) throw ApiException.validation("name: required");
        String answers = answers(JoinJdbcRepository.questions(card.path("questions").toString()), req.answers());

        UUID requestId;
        try {
            requestId = UUID.fromString(req.requestId());
        } catch (IllegalArgumentException e) {
            throw OtpService.requestNotFound();
        }
        otp.verifyRequestFor(requestId, req.otp(), phone);

        TenantContext before = TenantContext.current();
        TenantContext.set(TenantContext.bootstrap(phone));
        String result;
        try {
            result = repo.submit(slug.toLowerCase(Locale.ROOT), name, phone, Text.orNull(Text.strip(req.email())), req.dateOfBirth(),
                    req.gender(), req.packId(), answers, req.policyVersion().strip(), Boolean.TRUE.equals(req.whatsappReminders()));
        } finally {
            TenantContext.set(before);
        }
        String trainer = card.path("trainer").path("name").isString() ? card.path("trainer").path("name").asString() : null;
        return switch (result) {
            case "received", "updated" -> new JoinSubmitted(result, trainer);
            case "plan_unavailable" -> throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "JOIN_PLAN_UNAVAILABLE",
                    "That plan isn’t offered any more. Reload the page and pick again.");
            // V49: added already, but not a member yet — "sign in" would be wrong for both.
            case "invite_waiting" -> throw ApiException.conflict("JOIN_INVITE_WAITING",
                    "Your trainer has already invited you. Open the invite link they sent you on WhatsApp to join.");
            case "ask_for_invite" -> throw ApiException.conflict("JOIN_ASK_FOR_INVITE",
                    "Your trainer has already added you. Ask them to send you an invite link, then open it to join.");
            case "already_client" -> throw ApiException.conflict("JOIN_ALREADY_CLIENT",
                    "You’re already on this trainer’s list. Sign in instead.");
            case "with_another_trainer" -> throw ApiException.conflict("ALREADY_WITH_A_TRAINER",
                    "You’re already with a trainer. Leave them first, then use this link.");
            case "unavailable" -> throw ApiException.conflict("JOIN_NUMBER_UNAVAILABLE",
                    "This number is a trainer’s account, so it can’t join as a client.");
            case "age_requirement" -> throw ageRequirement();
            case "full" -> throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "JOIN_FULL",
                    "This trainer has a lot of requests waiting. Try again in a few days.");
            default -> throw closed();
        };
    }

    /**
     * The answers, checked against the link's questions as they are now, by kind (22 Nov 2026): a required one must be
     * there; yes/no is a yes or a no; a rating is 1..scale; a choice names its own options (one unless several are allowed)
     * and an "Other" line only where the question has one; text is at most 1000 characters. Stored as {questionId, label,
     * answer} with the answer READ OUT ("Yes", "7 out of 10", "Strength, Mobility; Other: yoga"), because the trainer reads
     * it as a sentence and the label is kept with it so a later edit of the question cannot change what was answered.
     */
    private static String answers(List<JoinQuestion> questions, List<JoinSubmitRequest.Answer> given) {
        Map<String, JoinSubmitRequest.Answer> byId = new HashMap<>();
        if (given != null) for (var a : given) if (a != null) byId.put(a.questionId(), a);
        var out = new ArrayList<Map<String, String>>();
        for (JoinQuestion q : questions) {
            String said = readOut(q, byId.get(q.id()));
            if (said == null) {
                if (Boolean.TRUE.equals(q.required())) throw ApiException.validation("answers: “" + q.text() + "” is required");
                continue;
            }
            out.add(Map.of("questionId", q.id(), "label", q.text(), "answer", said));
        }
        return JoinJdbcRepository.JSON.writeValueAsString(out);
    }

    /** The answer as the trainer will read it, or null when there is none. Refuses one that does not fit the question. */
    private static String readOut(JoinQuestion q, JoinSubmitRequest.Answer a) {
        if (a == null) return null;
        String legacy = Text.orNull(Text.strip(a.answer()));
        String text = Text.orNull(Text.strip(a.text()));
        String bad = "answers: “" + q.text() + "” — ";
        switch (q.kind()) {
            case "yesno" -> {
                Boolean yes = a.yes();
                if (yes == null && legacy != null) yes = legacy.equalsIgnoreCase("yes") ? Boolean.TRUE : legacy.equalsIgnoreCase("no") ? Boolean.FALSE : null;
                return yes == null ? null : yes ? "Yes" : "No";
            }
            case "rating" -> {
                if (a.rating() == null) return null;
                int scale = q.scale() == null ? 10 : q.scale();
                if (a.rating() < 1 || a.rating() > scale) throw ApiException.validation(bad + "a number from 1 to " + scale);
                return a.rating() + " out of " + scale;
            }
            case "choice" -> {
                var picked = new ArrayList<String>();
                var ids = a.optionIds() == null ? List.<String>of() : a.optionIds();
                for (String id : ids) {
                    var o = q.options().stream().filter(x -> x.id().equals(id)).findFirst()
                            .orElseThrow(() -> ApiException.validation(bad + "pick from its options"));
                    if (!picked.contains(o.text())) picked.add(o.text());
                }
                if (ids.isEmpty() && legacy != null) {
                    var o = q.options().stream().filter(x -> x.text().equals(legacy)).findFirst()
                            .orElseThrow(() -> ApiException.validation(bad + "pick from its options"));
                    picked.add(o.text());
                }
                if (picked.size() > 1 && !Boolean.TRUE.equals(q.allowMultiple())) throw ApiException.validation(bad + "pick one");
                if (text != null && !Boolean.TRUE.equals(q.allowCustom())) throw ApiException.validation(bad + "pick from its options");
                if (text != null && text.length() > 200) throw ApiException.validation(bad + "at most 200 characters");
                if (picked.isEmpty() && text == null) return null;
                String list = String.join(", ", picked);
                return text == null ? list : list.isEmpty() ? "Other: " + text : list + "; Other: " + text;
            }
            default -> {
                String t = text != null ? text : legacy;
                if (t != null && t.length() > 1000) throw ApiException.validation(bad + "at most 1000 characters");
                return t;
            }
        }
    }

    private void checkDateAndNotice(LocalDate dob, String policyVersion) {
        LocalDate today = WorkspaceClock.today(ZONE);
        if (dob.isBefore(LocalDate.of(1900, 1, 1))) throw ApiException.validation("dateOfBirth: before 1900");
        if (dob.isAfter(today)) throw ApiException.validation("dateOfBirth: in the future");
        String inForce = props.getPrivacy().getPolicyVersion();
        if (!inForce.equals(policyVersion.strip())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONSENT_REQUIRED",
                    "policyVersion: the privacy notice in force is " + inForce + ". Reload the notice and accept that one.");
        }
        if (dob.isAfter(today.minusYears(18))) throw ageRequirement();
    }

    private static String phone(String raw) {
        String p = raw == null ? "" : raw.replaceAll("[\\s-]", "");
        if (!PHONE.matcher(p).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "PHONE_INVALID", SendOtpRequest.PHONE_MESSAGE);
        }
        return p;
    }

    /** A slug can only be one of these, so anything else never reaches the database. */
    static boolean wellFormed(String slug) {
        return slug != null && slug.length() <= 40 && JoinLinkService.SLUG.matcher(slug.toLowerCase(Locale.ROOT)).matches();
    }

    private static ApiException closed() {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "JOIN_CLOSED", "This page isn’t taking new clients right now.");
    }

    private static ApiException ageRequirement() {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "AGE_REQUIREMENT", "This isn’t available for you. Please talk to the trainer.");
    }

    private static String text(JsonNode n, String key) {
        JsonNode v = n.path(key);
        return v.isString() && !v.asString().isBlank() ? v.asString() : null;
    }

    private static List<String> list(JsonNode n) {
        var out = new ArrayList<String>();
        if (n.isArray()) n.forEach(e -> { if (e.isString()) out.add(e.asString()); });
        return out;
    }
}
