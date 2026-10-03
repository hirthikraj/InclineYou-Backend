package com.inclineyou.inclineyou_backend.core.trainer.dto;

import java.util.List;

/**
 * {@code PATCH /v1/working-hours} — replaces ONLY the weekdays listed; the rest of the week is
 * untouched, which is what lets a save that only changed the gym name leave a Saturday alone.
 * {@code windows: []} on a listed weekday is a rest day. Fields are boxed and unvalidated here: the
 * service owns every rule so each refusal is one sentence naming the field.
 */
public record WorkingHoursPatch(List<Day> days) {

    /** @param weekday 1 = Monday … 7 = Sunday, the schema's numbering. */
    public record Day(Integer weekday, List<Window> windows) {}

    /** {@code "HH:mm"} wall-clock times, the trainer's own clock. */
    public record Window(String start, String end) {}
}
