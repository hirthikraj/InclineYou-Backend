package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentDetail;
import com.inclineyou.inclineyou_backend.core.assessment.dto.AssessmentItem;
import com.inclineyou.inclineyou_backend.core.assessment.dto.Count;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * An assessment's {@code form}, and the two things derived from a row that
 * every route needs: its list item and its state.
 *
 * <p>The form is the assessment's OWN copy of its template — catalogue labels and
 * units written in, so the copy reads on its own after the template is edited or
 * deleted. It is what the entry is validated against, never the template.
 */
final class AssessmentForms {

    private AssessmentForms() {}

    /** What is stored in {@code assessment.form}. */
    record Form(List<AssessmentDetail.FormMeasurement> measurements, List<AssessmentCatalogue.Question> questions) {}

    /** The template as it stands, copied: a block switched off copies as nothing. */
    static Form copyOf(AssessmentTemplateJdbcRepository.Stored tpl) {
        var measurements = !tpl.measurements().on() ? List.<AssessmentDetail.FormMeasurement>of()
                : tpl.measurements().keys().stream()
                        .map(AssessmentCatalogue.BY_KEY::get)
                        .map(m -> new AssessmentDetail.FormMeasurement(m.key(), m.label(), m.group(), m.unit()))
                        .toList();
        var questions = tpl.questions().on() ? tpl.questions().items() : List.<AssessmentCatalogue.Question>of();
        return new Form(measurements, questions);
    }

    static Form read(String json) {
        return AssessmentJson.read(json, Form.class);
    }

    /** {@code done} once completed; else {@code booked} while due today or later; else {@code missed}. */
    static String state(boolean completed, LocalDate dueOn, LocalDate today) {
        if (completed) return "done";
        return dueOn.isBefore(today) ? "missed" : "booked";
    }

    static AssessmentItem item(AssessmentRow r, LocalDate today) {
        var form = read(r.form());
        Map<String, Object> readings = AssessmentJson.plainMap(r.readings());
        Map<String, Object> answers = AssessmentJson.plainMap(r.answers());
        return new AssessmentItem(r.id().toString(), r.clientId().toString(), r.templateId().toString(),
                r.scheduleId() == null ? null : r.scheduleId().toString(), r.name(), r.dueOn().toString(),
                state(r.done(), r.dueOn(), today), r.completedAt() == null ? null : r.completedAt().toEpochMilli(),
                r.enteredBy(), new Count(readings.size(), form.measurements().size()),
                new Count(answers.size(), form.questions().size()), r.createdAt().toEpochMilli(), r.version());
    }
}
