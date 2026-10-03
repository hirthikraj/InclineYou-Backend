package com.inclineyou.inclineyou_backend.core.progress.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;

/** One completed set. Field order is the wire order — append, never reorder. */
public record SetRow(String sessionId, String date, String exerciseId, int position,
                     String loadKind, String effortKind, Double loadValue, Double effortValue,
                     Double rpe, long doneAt,
                     /** The keyset position, never on the wire. */
                     @JsonIgnore String cursorKey,
                     /** The set_log id — on the wire since 3 Oct so a past set can be corrected (PATCH /v1/sessions/{sessionId}/sets/{setId}). */
                     String setId,
                     /** Read in the same query (scheduled_session.workout_id → workout.name); lifted into {@code sessions}. */
                     @JsonIgnore String workoutName) {}
