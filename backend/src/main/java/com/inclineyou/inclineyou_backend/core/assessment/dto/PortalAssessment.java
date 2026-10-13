package com.inclineyou.inclineyou_backend.core.assessment.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.inclineyou.inclineyou_backend.core.assessment.AssessmentCatalogue;
import com.inclineyou.inclineyou_backend.core.assessment.dto.EntryRequest.Answer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The client's assessments wire (api-contract 1.2, pa-l1 … pa-a2): what is waiting, one assessment to take or to read back, the templates the
 * trainer offers, and the entry. This is the ONLY place a client sees or writes a body measurement — there is no loose weigh-in and no
 * measurements screen — so a reading is always an assessment's own.
 */
public final class PortalAssessment {

    private PortalAssessment() {}

    public record Asks(int measurements, int questions) {}

    public record Item(String id, String name, String systemKey, String state, Long sentAt, String dueOn, boolean late, Long completedAt, Asks asks) {}

    public record Counts(int open, int done) {}

    /** {@code counts} only when asked for ({@code include=counts}); {@code nextCursor} is null on the last page, as the contract shows. */
    public record Page(List<Item> items, @JsonInclude(JsonInclude.Include.NON_NULL) Counts counts, boolean canStart, String nextCursor) {}

    /** {@code optional} is always true: every measurement may be skipped. */
    public record Measurement(String key, String label, String group, String unit, boolean optional) {}

    public record Asked(List<Measurement> measurements, List<AssessmentCatalogue.Question> questions) {}

    /** A reading read back, with the last completed one's value and the change since — a number, never a verdict. */
    public record Reading(String key, String label, String group, String unit, BigDecimal value, BigDecimal previous, BigDecimal change) {}

    /** What was asked of {@code open} ones is the form and the draft; what was taken is for {@code done} ones — the rest are absent. */
    public record Detail(String id, String name, String state, Long sentAt, String dueOn, boolean late, Long completedAt, String version,
                         Asked asked, AssessmentDetail.Entry entry, boolean weightHidden, String healthNotice,
                         @JsonInclude(JsonInclude.Include.NON_NULL) List<Reading> readings,
                         @JsonInclude(JsonInclude.Include.NON_NULL) List<AssessmentDetail.AnswerView> answers,
                         @JsonInclude(JsonInclude.Include.NON_NULL) List<AssessmentDetail.History> history,
                         @JsonInclude(JsonInclude.Include.NON_NULL) List<AssessmentDetail.Returned> returned) {}

    public record Template(String id, String name, String description, String systemKey, Asks asks, String openAssessmentId) {}

    public record Templates(List<Template> items) {}

    /** {@code PUT …/entry}: the whole entry. No back-dating — a client submits now. */
    public record Entry(@NotNull(message = "required") Map<String, BigDecimal> readings,
                        @NotNull(message = "required") Map<String, @Valid @NotNull(message = "required") Answer> answers,
                        @NotNull(message = "required") Boolean complete) {}

    public record Start(@NotNull(message = "required") String id, @NotNull(message = "required") String templateId) {}
}
