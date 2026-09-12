package com.inclineyou.inclineyou_backend.nudge;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The template library — the trainer's own wording for each of the eight nudges.
 *
 * <h2>An OVERRIDE table, not a seeded one</h2>
 *
 * A trainer who has never opened this screen has no rows here at all, and every
 * button in the app sends {@link NudgeTemplateCatalog}'s default. Seeding eight
 * rows on signup was the obvious alternative and it is the wrong one: it freezes
 * today's copy into every account that ever existed, so improving a default
 * sentence — and these are sentences a trainer sends to somebody they see three
 * times a week — would reach nobody. Resetting a template is a DELETE for the
 * same reason: it puts the trainer back on the live default rather than on a copy
 * of whatever the default happened to be the day they signed up.
 *
 * <h2>What the read returns, and why it is not just the bodies</h2>
 *
 * {@code GET} merges the catalogue with the overrides and returns all eight,
 * every one carrying its label, its purpose, its variables and whether the body
 * is the trainer's or the built-in. The web holds NO copy of any of it. That is
 * the point: the resend ladder in this product exists in three places and the
 * root {@code CLAUDE.md} opens with the warning, so a ninth template — or a
 * reworded default — is a backend change and nothing else.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NudgeTemplateService {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Long enough for six sentences, short enough that nobody pastes an essay.
     * A reminder that has to be scrolled is a reminder that gets skimmed.
     */
    public static final int MAX_BODY = 600;

    /**
     * @param body       the wording that will actually be sent
     * @param isDefault  false once the trainer has saved their own. The editor
     *                   draws *Reset* only when this is false, which is the only
     *                   honest way to offer it — a Reset on an untouched template
     *                   is a button that does nothing.
     */
    public record TemplateResponse(
            String name,
            String label,
            String purpose,
            String body,
            boolean isDefault,
            List<VariableResponse> variables
    ) {}

    public record VariableResponse(String token, String meaning) {}

    public record SaveTemplateRequest(String body) {}

    /* ── read ─────────────────────────────────────────────────────────────── */

    public List<TemplateResponse> list(UUID trainerId) {
        Map<String, String> overrides = overridesFor(trainerId);
        List<TemplateResponse> out = new ArrayList<>();
        for (var t : NudgeTemplateCatalog.all()) {
            String override = overrides.get(t.name());
            out.add(new TemplateResponse(
                    t.name(),
                    t.label(),
                    t.purpose(),
                    override != null ? override : t.body(),
                    override == null,
                    t.variables().stream()
                            .map(v -> new VariableResponse(v.token(), v.meaning()))
                            .toList()
            ));
        }
        return out;
    }

    /**
     * Every override this trainer has, by template name. Read whole rather than
     * one at a time: there are at most eight rows, and {@link NudgeService}
     * needs exactly one of them per send — a per-name query there would be one
     * round trip on the hot path to save reading seven short strings.
     */
    public Map<String, String> overridesFor(UUID trainerId) {
        Map<String, String> out = new HashMap<>();
        jdbc.query("""
                SELECT name, body FROM nudge_template
                WHERE trainer_id = :tid::uuid AND deleted_at IS NULL
                """,
                Map.of("tid", trainerId.toString()),
                rs -> { out.put(rs.getString("name"), rs.getString("body")); });
        return out;
    }

    /* ── write ────────────────────────────────────────────────────────────── */

    /**
     * Save the trainer's wording for one template.
     *
     * <p>An upsert on {@code (trainer_id, name)} — the unique index V32 declares —
     * so saving twice is one row and the second save is not a conflict. The name
     * is checked against the catalogue rather than stored freely: an override for
     * a template nothing sends is a row the trainer edits and never sees used.
     *
     * <p>The body is NOT validated for which variables it contains. A trainer who
     * deletes {@code {amount}} from the payment reminder has written a payment
     * reminder that does not name the figure, which is a legitimate thing to
     * want; and an unknown token is left in the message verbatim rather than
     * blanked, so a typo shows up as itself in the WhatsApp composer where the
     * trainer can see it before they press send. Rendering silently is how a
     * client receives "Hi , you owe .".
     */
    public TemplateResponse save(UUID trainerId, String name, String rawBody) {
        var template = NudgeTemplateCatalog.find(name);
        if (template == null) throw NudgeRuleException.unknownTemplate(name);

        String body = rawBody == null ? "" : rawBody.trim();
        if (body.isEmpty()) throw NudgeRuleException.emptyBody();
        if (body.length() > MAX_BODY) throw NudgeRuleException.bodyTooLong(MAX_BODY);

        jdbc.update("""
                INSERT INTO nudge_template (trainer_id, name, body)
                VALUES (:tid::uuid, :name, :body)
                ON CONFLICT (trainer_id, name) WHERE deleted_at IS NULL
                DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()
                """, Map.of(
                "tid", trainerId.toString(),
                "name", name,
                "body", body
        ));
        log.info("nudge template saved trainer={} template={}", trainerId, name);

        return new TemplateResponse(
                template.name(), template.label(), template.purpose(), body, false,
                template.variables().stream()
                        .map(v -> new VariableResponse(v.token(), v.meaning()))
                        .toList());
    }

    /**
     * Back to the built-in wording.
     *
     * <p>A SOFT delete, like everything else in this schema, and idempotent: a
     * reset on a template that was never overridden answers with the default and
     * writes nothing. There is no 404 here — "put it back how it was" cannot
     * meaningfully fail, and answering a no-op with an error would make the
     * button look broken on the one press where it had nothing to do.
     */
    public TemplateResponse reset(UUID trainerId, String name) {
        var template = NudgeTemplateCatalog.find(name);
        if (template == null) throw NudgeRuleException.unknownTemplate(name);

        jdbc.update("""
                UPDATE nudge_template SET deleted_at = NOW(), updated_at = NOW()
                WHERE trainer_id = :tid::uuid AND name = :name AND deleted_at IS NULL
                """, Map.of("tid", trainerId.toString(), "name", name));

        return new TemplateResponse(
                template.name(), template.label(), template.purpose(), template.body(), true,
                template.variables().stream()
                        .map(v -> new VariableResponse(v.token(), v.meaning()))
                        .toList());
    }
}
