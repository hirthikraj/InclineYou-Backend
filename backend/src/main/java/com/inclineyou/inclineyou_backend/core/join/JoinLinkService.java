package com.inclineyou.inclineyou_backend.core.join;

import com.inclineyou.inclineyou_backend.core.join.dto.JoinLinkSettings;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinLinkUpdate;
import com.inclineyou.inclineyou_backend.core.join.dto.JoinQuestion;
import com.inclineyou.inclineyou_backend.infrastructure.config.AppProperties;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.util.Text;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The trainer's join link settings (api-contract 1.2, jl-a1, jl-a2). One per trainer per workspace; one form, one Save.
 *
 * <p>Refused, not trimmed: a welcome line over 200 or a message over 1000 characters is a 400, as the profile's prose is (V33),
 * because cutting somebody's last sentence while answering 200 is worse than saying no.
 */
@Service
@RequiredArgsConstructor
public class JoinLinkService {

    /** 3–40 characters, a–z, 0–9 and single hyphens, not at either end. join_link_slug says the same. */
    static final Pattern SLUG = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$");
    static final int MAX_QUESTIONS = 15;
    static final int MAX_OPTIONS = 10;
    static final int MAX_PACKS = 12;

    private final JoinJdbcRepository repo;
    private final AppProperties props;

    public JoinLinkSettings get(UUID trainerId, UUID tenantId) {
        return repo.link(trainerId, tenantId).map(this::settings).orElseGet(() -> {
            // The link is the BUSINESS's name (22 Nov 2026, the owner's call): the workspace's name, V46.
            String slug = suggest(repo.businessName(tenantId), trainerId, tenantId);
            return new JoinLinkSettings(false, slug, url(slug), false, null, List.of(), List.of(), true, null, null, null);
        });
    }

    /**
     * The slug is NOT the trainer's to choose (22 Nov 2026, the owner's call): it is made from the business name the first
     * time the link is saved, numbered if taken, and never changes after — not even when the business is renamed, so a QR
     * code already printed or shared keeps working. A {@code slug} in the request is ignored.
     */
    @Transactional
    public JoinLinkSettings save(UUID trainerId, UUID tenantId, JoinLinkUpdate req) {
        String slug = repo.link(trainerId, tenantId).map(JoinJdbcRepository.Link::slug)
                .orElseGet(() -> suggest(repo.businessName(tenantId), trainerId, tenantId));
        String line = Text.orNull(Text.strip(req.welcomeLine()));
        if (line != null && line.length() > 200) throw ApiException.validation("welcomeLine: at most 200 characters");
        String message = Text.orNull(Text.strip(req.welcomeMessage()));
        if (message != null && message.length() > 1000) throw ApiException.validation("welcomeMessage: at most 1000 characters");

        List<JoinQuestion> questions = questions(req.questions());

        var asked = new LinkedHashSet<>(req.packIds() == null ? List.<UUID>of() : req.packIds());
        if (asked.size() > MAX_PACKS) throw ApiException.validation("packIds: at most " + MAX_PACKS);
        var mine = new HashSet<>(repo.ownActivePacks(trainerId, tenantId, new ArrayList<>(asked)));
        for (UUID id : asked) {
            if (!mine.contains(id)) throw ApiException.validation("packIds: " + id + " is not one of your active packs");
        }
        boolean allowNoPlan = req.allowNoPlan();
        if (!allowNoPlan && asked.isEmpty()) {
            throw ApiException.validation("allowNoPlan: with no plans offered, people must be able to join without one");
        }
        if (req.checkInTemplateId() != null && !repo.ownTemplate(trainerId, req.checkInTemplateId())) {
            throw ApiException.validation("checkInTemplateId: not one of your assessment templates");
        }
        repo.save(trainerId, tenantId, slug, req.takingJoins(), line, questions, new ArrayList<>(asked), allowNoPlan, message,
                req.checkInTemplateId());
        return get(trainerId, tenantId);
    }

    static final java.util.Set<String> KINDS = java.util.Set.of("yesno", "rating", "text", "choice");
    static final java.util.Set<Integer> SCALES = java.util.Set.of(5, 10, 20);

    /**
     * Each question checked and normalised, by the assessment's rules (22 Nov 2026): a closed set of four kinds, a rating out
     * of 5, 10 or 20, a choice of 2–10 options. An id the screen did not send is made here.
     */
    private static List<JoinQuestion> questions(List<JoinQuestion> in) {
        if (in == null) return List.of();
        if (in.size() > MAX_QUESTIONS) throw ApiException.validation("questions: at most " + MAX_QUESTIONS);
        var out = new ArrayList<JoinQuestion>();
        var ids = new HashSet<String>();
        for (int i = 0; i < in.size(); i++) {
            JoinQuestion q = in.get(i);
            String at = "questions[" + i + "]";
            if (q == null) throw ApiException.validation(at + ": required");
            String text = Text.orNull(Text.strip(q.text()));
            if (text == null) throw ApiException.validation(at + ".text: required");
            if (text.length() > 200) throw ApiException.validation(at + ".text: at most 200 characters");
            String kind = q.kind() == null ? "text" : q.kind();
            if (!KINDS.contains(kind)) throw ApiException.validation(at + ".kind: yesno, rating, text or choice");
            String id = q.id() == null || !q.id().matches("^[A-Za-z0-9_-]{1,60}$") ? UUID.randomUUID().toString().substring(0, 8) : q.id();
            if (!ids.add(id)) {
                id = UUID.randomUUID().toString().substring(0, 8);
                ids.add(id);
            }
            Integer scale = null;
            if (kind.equals("rating")) {
                scale = q.scale() == null ? 10 : q.scale();
                if (!SCALES.contains(scale)) throw ApiException.validation(at + ".scale: 5, 10 or 20");
            }
            var options = new ArrayList<JoinQuestion.Option>();
            boolean multiple = false, custom = false;
            if (kind.equals("choice")) {
                var seen = new HashSet<String>();
                for (JoinQuestion.Option o : q.options() == null ? List.<JoinQuestion.Option>of() : q.options()) {
                    String t = o == null ? null : Text.orNull(Text.strip(o.text()));
                    if (t == null) continue;
                    if (t.length() > 80) throw ApiException.validation(at + ".options: each at most 80 characters");
                    if (!seen.add(t)) continue;
                    String oid = o.id() == null || !o.id().matches("^[A-Za-z0-9_-]{1,80}$") ? id + "_o" + options.size() : o.id();
                    options.add(new JoinQuestion.Option(oid, t));
                }
                if (options.size() < 2) throw ApiException.validation(at + ".options: at least two");
                if (options.size() > MAX_OPTIONS) throw ApiException.validation(at + ".options: at most " + MAX_OPTIONS);
                multiple = Boolean.TRUE.equals(q.allowMultiple());
                custom = Boolean.TRUE.equals(q.allowCustom());
            }
            out.add(new JoinQuestion(id, text, kind, scale, options, multiple, custom, Boolean.TRUE.equals(q.required())));
        }
        return out;
    }

    private JoinLinkSettings settings(JoinJdbcRepository.Link l) {
        return new JoinLinkSettings(true, l.slug(), url(l.slug()), l.takingJoins(), l.welcomeLine(), l.questions(), l.packIds(),
                l.allowNoPlan(), l.welcomeMessage(), l.checkInTemplateId(), l.updatedAt());
    }

    String url(String slug) {
        return props.getWeb().getBaseUrl().replaceAll("/+$", "") + "/join/" + slug;
    }

    /** A slug from the business name ("Flex Fitness" → flex-fitness), numbered when taken. */
    private String suggest(String name, UUID trainerId, UUID tenantId) {
        String base = Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (base.length() > 34) base = base.substring(0, 34).replaceAll("-+$", "");
        if (base.length() < 3) base = "trainer";
        String candidate = base;
        for (int n = 2; repo.slugTaken(candidate, trainerId, tenantId) && n < 100; n++) candidate = base + "-" + n;
        return candidate;
    }
}
