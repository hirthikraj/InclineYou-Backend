package com.inclineyou.inclineyou_backend.core.nudge;

import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * The template library — the trainer's own wording for each of the eight nudges.
 *
 * <h2>An OVERRIDE table, not a seeded one</h2>
 *
 * A trainer who has never opened this screen has no rows, and every button in the app sends
 * {@link NudgeTemplateCatalog}'s default. Seeding eight rows on signup would freeze today's copy
 * into every account, so improving a default sentence would reach nobody; resetting is a DELETE for
 * the same reason — it puts the trainer back on the live default.
 *
 * <h2>Versions</h2>
 *
 * A template's {@code version} is its override row's {@code updated_at} as epoch ms, and
 * {@code null} while it is the built-in wording. A PUT replaces the whole body, so it must carry
 * {@code If-Match}: the version it read, or {@code *} to create the first override (412 if somebody
 * else already did).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NudgeTemplateService {

    private final NudgeTemplateJdbcRepository repo;

    /** Six sentences, not an essay: a reminder that has to be scrolled gets skimmed. */
    public static final int MAX_BODY = 1000;

    /** The library's order — the nudge_template_name check's, which is the contract's. */
    private static final List<String> ORDER = List.of("payment_reminder", "renewal", "missed_session",
            "re_engagement", "session_reminder", "session_summary", "well_done", "check_in");

    private static final Pattern TOKEN = Pattern.compile("\\{[^{}\\s]*}");

    /**
     * @param isDefault false once the trainer has saved their own — the editor draws Reset only then.
     * @param version   the override's version, null while built-in.
     */
    public record TemplateResponse(
            String name,
            String label,
            String purpose,
            String body,
            boolean isDefault,
            List<VariableResponse> variables,
            String version
    ) {}

    /** {@code label} is the contract's word; {@code meaning} is what 1.0 called it and stays for old callers. */
    public record VariableResponse(String token, String label, String meaning) {}

    public record SaveTemplateRequest(String body) {}

    /* ── read ─────────────────────────────────────────────────────────────── */

    /** All eight, always, in the library's order. */
    public List<TemplateResponse> list(UUID trainerId) {
        Map<String, NudgeTemplateJdbcRepository.Override> overrides = repo.overrides(trainerId);
        List<TemplateResponse> out = new ArrayList<>();
        for (String name : ORDER) {
            var t = NudgeTemplateCatalog.find(name);
            if (t != null) out.add(row(t, overrides.get(name)));
        }
        // A template the catalogue grows before ORDER does still shows, after the eight.
        for (var t : NudgeTemplateCatalog.all()) {
            if (!ORDER.contains(t.name())) out.add(row(t, overrides.get(t.name())));
        }
        return out;
    }

    /** The list's ETag: every version, in order — it changes when any one template does. */
    public static String listVersion(List<TemplateResponse> rows) {
        return Integer.toHexString(rows.stream().map(r -> r.name() + ":" + r.version()).collect(Collectors.joining("|")).hashCode());
    }

    /**
     * Every override's wording by name — what {@link NudgeService} renders from. Read whole: there
     * are at most eight, and a per-name query on the hot path would save reading seven short strings.
     */
    public Map<String, String> overridesFor(UUID trainerId) {
        return repo.overrides(trainerId).entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().body()));
    }

    /* ── write ────────────────────────────────────────────────────────────── */

    /**
     * Reword one template. {@code ifMatch} is required (428); {@code *} means "there is no override
     * yet" and is a 412 if there is one. Unknown name is a 404; a blank body 400 {@code VALIDATION};
     * a {@code {token}} the template does not fill 400 {@code UNKNOWN_VARIABLE}.
     *
     * <p>Unknown tokens are refused rather than left in the message: the library is edited months
     * before it is read back, and a "{nmae}" caught here is one that never reaches a client.
     */
    @Transactional
    public TemplateResponse save(UUID trainerId, String name, String rawBody, String ifMatch) {
        var template = NudgeTemplateCatalog.find(name);
        if (template == null) throw ApiException.notFound("There is no template called \"" + name + "\".");
        IfMatch.require(ifMatch, "this template");

        var current = repo.overrides(trainerId).get(name);
        if ("*".equals(ifMatch.strip())) {
            if (current != null) throw precondition("You already reworded this message — reload to see it.");
        } else if (current == null || IfMatch.stale(ifMatch, String.valueOf(current.version()))) {
            throw precondition("This message changed since you opened it — reload to see the latest.");
        }

        String body = rawBody == null ? "" : rawBody.strip();
        if (body.isEmpty()) throw ApiException.validation("body: a template needs some words in it — use Reset to go back to the default");
        if (body.length() > MAX_BODY) throw ApiException.validation("body: keep it under " + MAX_BODY + " characters — a long reminder does not get read");
        Set<String> allowed = template.variables().stream().map(NudgeTemplateCatalog.Variable::token).collect(Collectors.toSet());
        Matcher m = TOKEN.matcher(body);
        while (m.find()) {
            if (!allowed.contains(m.group())) {
                throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "UNKNOWN_VARIABLE",
                        m.group() + " is not something this message fills in. You can use: "
                                + String.join(" ", template.variables().stream().map(NudgeTemplateCatalog.Variable::token).toList()));
            }
        }

        long version = repo.upsert(trainerId, name, body);
        log.info("nudge template saved trainer={} template={}", trainerId, name);
        return row(template, new NudgeTemplateJdbcRepository.Override(body, version));
    }

    /**
     * Back to the built-in wording. Idempotent — resetting a template with no override is 200 with the
     * default, because "put it back how it was" cannot meaningfully fail.
     */
    @Transactional
    public TemplateResponse reset(UUID trainerId, String name) {
        var template = NudgeTemplateCatalog.find(name);
        if (template == null) throw ApiException.notFound("There is no template called \"" + name + "\".");
        repo.delete(trainerId, name);
        return row(template, null);
    }

    private static TemplateResponse row(NudgeTemplateCatalog.Template t, NudgeTemplateJdbcRepository.Override o) {
        return new TemplateResponse(t.name(), t.label(), t.purpose(),
                o != null ? o.body() : t.body(), o == null,
                t.variables().stream().map(v -> new VariableResponse(v.token(), v.meaning(), v.meaning())).toList(),
                o == null ? null : String.valueOf(o.version()));
    }

    private static ApiException precondition(String message) {
        return new ApiException(org.springframework.http.HttpStatus.PRECONDITION_FAILED, "PRECONDITION_FAILED", message);
    }
}
