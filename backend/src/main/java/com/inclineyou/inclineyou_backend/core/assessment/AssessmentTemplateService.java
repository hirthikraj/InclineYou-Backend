package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.TemplateRequest;
import com.inclineyou.inclineyou_backend.shared.exception.ApiException;
import com.inclineyou.inclineyou_backend.shared.wire.IfMatch;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * api-contract 1.1 Assessments — the trainer's templates: which catalogue
 * measurements to take and which questions to ask.
 *
 * <p>The editor holds the whole draft and saves it as a unit, so a write is the
 * whole form and a PUT is conditional (428 without {@code If-Match}, 412 when the
 * form was edited elsewhere since it loaded). What was a silent repair in the
 * pre-1.1 build is now a 400 naming the field: an unknown key, a rating scale
 * outside 5 · 10 · 20, a choice with fewer than two options. Two things are
 * still normalised, because the editor keeps state the kind does not use while a
 * trainer flips a question back and forth: {@code scale} is dropped unless the
 * kind is {@code rating}, and {@code options}, {@code allowMultiple} and
 * {@code allowCustom} are cleared unless it is {@code choice}. What is stored is
 * what the client will be shown.
 *
 * <p>An edit reaches the open assessments nobody has started (R36); a started
 * one keeps the form it is being answered against. A delete is soft, ends every
 * live cycle on the template, and leaves every assessment already given as it
 * was — each holds its own copy of the form.
 */
@Service
@RequiredArgsConstructor
public class AssessmentTemplateService {

    private static final int MAX_QUESTIONS = 50;
    private static final int MAX_OPTIONS = 20;
    private static final int MAX_TEXT = 500;
    private static final int MAX_ID = 64;
    private static final Set<String> KINDS = Set.of("yesno", "rating", "text", "choice");
    private static final Set<Integer> SCALES = Set.of(5, 10, 20);

    private final AssessmentTemplateJdbcRepository templates;
    private final AssessmentScheduleJdbcRepository schedules;
    private final AssessmentJdbcRepository assessments;

    public record Created(TemplateItem template, boolean created) {}

    /** The whole shelf, one grouped query for the live-cycle counts. */
    public List<TemplateItem> list(UUID trainerId) {
        var cycles = templates.liveCycles(trainerId);
        return templates.live(trainerId).stream().map(t -> item(t, cycles.getOrDefault(t.id(), 0))).toList();
    }

    @Transactional
    public Created create(UUID trainerId, TemplateRequest req) {
        if (req.id() != null) {
            var mine = templates.isMine(req.id(), trainerId);
            if (mine.isPresent()) {
                if (!mine.get()) throw ApiException.idConflict();
                return new Created(one(trainerId, req.id()), false);
            }
        }
        var form = normalise(req);
        if (templates.nameTaken(trainerId, form.name(), null)) throw nameTaken();
        UUID id = req.id() == null ? UUID.randomUUID() : req.id();
        try {
            if (!templates.insert(id, trainerId, form.name(), form.description(),
                    AssessmentJson.write(form.measurements()), AssessmentJson.write(form.questions()))) {
                throw ApiException.idConflict();
            }
        } catch (DuplicateKeyException e) {
            throw duplicate(e);
        }
        return new Created(one(trainerId, id), true);
    }

    /** Whole-form replace. Every open assessment nobody has started picks the new form up. */
    @Transactional
    public TemplateItem update(UUID trainerId, UUID id, String ifMatch, TemplateRequest req) {
        IfMatch.require(ifMatch, "the template");
        var current = templates.lock(trainerId, id).filter(t -> !t.deleted())
                .orElseThrow(() -> ApiException.notFound("That assessment template is not in your library."));
        IfMatch.check(ifMatch, current.version(), "This form was edited elsewhere since it loaded. Reload to see it.");
        if (req.id() != null && !req.id().equals(id)) throw ApiException.validation("id: must match the template's own");
        var form = normalise(req);
        if (templates.nameTaken(trainerId, form.name(), id)) throw nameTaken();
        try {
            templates.update(id, form.name(), form.description(),
                    AssessmentJson.write(form.measurements()), AssessmentJson.write(form.questions()));
        } catch (DuplicateKeyException e) {
            throw duplicate(e);
        }
        var saved = templates.find(trainerId, id).orElseThrow();
        assessments.refreshUnstarted(id, saved.name(), AssessmentJson.write(AssessmentForms.copyOf(saved)));
        return item(saved, templates.liveCycles(trainerId, id));
    }

    /** Soft, and idempotent: a deleted template answers 204 again. */
    @Transactional
    public void delete(UUID trainerId, UUID id) {
        var current = templates.lock(trainerId, id)
                .orElseThrow(() -> ApiException.notFound("That assessment template is not in your library."));
        if (current.deleted()) return;
        templates.softDelete(id);
        schedules.endLiveOnTemplate(trainerId, id);
    }

    // ── wire ──────────────────────────────────────────────────────────────────

    private TemplateItem one(UUID trainerId, UUID id) {
        var t = templates.find(trainerId, id).orElseThrow(ApiException::idConflict);
        return item(t, templates.liveCycles(trainerId, id));
    }

    static TemplateItem item(AssessmentTemplateJdbcRepository.Stored t, int liveCycles) {
        return new TemplateItem(t.id().toString(), t.name(), t.description(), t.measurements(), t.questions(),
                liveCycles, t.createdAt().toEpochMilli(), t.updatedAt().toEpochMilli(), t.version());
    }

    // ── validation ────────────────────────────────────────────────────────────

    private record Normalised(String name, String description,
                              TemplateItem.Measurements measurements, TemplateItem.Questions questions) {}

    private static Normalised normalise(TemplateRequest req) {
        String name = req.name().strip();
        if (name.isEmpty()) throw ApiException.validation("name: required");
        String description = req.description() == null || req.description().isBlank() ? null : req.description().strip();

        var keys = new LinkedHashSet<String>();
        if (req.measurements().keys() != null) {
            for (String k : req.measurements().keys()) {
                if (k == null || !AssessmentCatalogue.BY_KEY.containsKey(k) || AssessmentCatalogue.HELD_BACK.contains(k)) {
                    throw ApiException.validation("measurements.keys: " + k + " is not in the catalogue");
                }
                keys.add(k);
            }
        }

        var items = new ArrayList<AssessmentCatalogue.Question>();
        var ids = new HashSet<String>();
        List<AssessmentCatalogue.Question> asked = req.questions().items() == null ? List.of() : req.questions().items();
        if (asked.size() > MAX_QUESTIONS) throw ApiException.validation("questions.items: at most " + MAX_QUESTIONS);
        for (int i = 0; i < asked.size(); i++) {
            var q = question(asked.get(i), "questions.items[" + i + "]");
            if (!ids.add(q.id())) throw ApiException.validation("questions.items[" + i + "].id: used twice");
            items.add(q);
        }
        return new Normalised(name, description, new TemplateItem.Measurements(req.measurements().on(), List.copyOf(keys)),
                new TemplateItem.Questions(req.questions().on(), List.copyOf(items)));
    }

    private static AssessmentCatalogue.Question question(AssessmentCatalogue.Question q, String at) {
        if (q == null) throw ApiException.validation(at + ": required");
        String text = q.text() == null ? "" : q.text().strip();
        if (text.isEmpty()) throw ApiException.validation(at + ".text: required");
        if (text.length() > MAX_TEXT) throw ApiException.validation(at + ".text: at most " + MAX_TEXT + " characters");
        if (q.kind() == null || !KINDS.contains(q.kind())) {
            throw ApiException.validation(at + ".kind: one of yesno, rating, text, choice");
        }
        // A missing id is minted: the editor gives a fresh question none until it is saved.
        String id = q.id() == null || q.id().isBlank() ? "aq_" + UUID.randomUUID().toString().substring(0, 8) : q.id().strip();
        if (id.length() > MAX_ID) throw ApiException.validation(at + ".id: at most " + MAX_ID + " characters");

        Integer scale = null;
        if (q.kind().equals("rating")) {
            if (q.scale() == null || !SCALES.contains(q.scale())) throw ApiException.validation(at + ".scale: 5, 10 or 20");
            scale = q.scale();
        }
        boolean choice = q.kind().equals("choice");
        var options = new ArrayList<AssessmentCatalogue.Option>();
        if (choice) {
            List<AssessmentCatalogue.Option> given = q.options() == null ? List.of() : q.options();
            if (given.size() < 2) throw ApiException.validation(at + ".options: a choice needs at least 2");
            if (given.size() > MAX_OPTIONS) throw ApiException.validation(at + ".options: at most " + MAX_OPTIONS);
            var optionIds = new HashSet<String>();
            for (int j = 0; j < given.size(); j++) {
                var o = given.get(j);
                String otext = o == null || o.text() == null ? "" : o.text().strip();
                if (otext.isEmpty()) throw ApiException.validation(at + ".options[" + j + "].text: required");
                if (otext.length() > MAX_TEXT) {
                    throw ApiException.validation(at + ".options[" + j + "].text: at most " + MAX_TEXT + " characters");
                }
                String oid = o.id() == null || o.id().isBlank() ? String.valueOf((char) ('a' + (j % 26))) : o.id().strip();
                if (!optionIds.add(oid)) throw ApiException.validation(at + ".options[" + j + "].id: used twice");
                options.add(new AssessmentCatalogue.Option(oid, otext));
            }
        }
        return new AssessmentCatalogue.Question(id, text, q.kind(), scale, List.copyOf(options),
                choice && q.allowMultiple(), choice && q.allowCustom());
    }

    private static ApiException nameTaken() {
        return ApiException.conflict("TEMPLATE_NAME_TAKEN", "You already have a form with that name.");
    }

    /** The pre-checks above answer the ordinary case; this is two saves racing for one name or id. */
    private static ApiException duplicate(DuplicateKeyException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        return msg.contains("uq_assessment_template_name") ? nameTaken() : ApiException.idConflict();
    }
}
