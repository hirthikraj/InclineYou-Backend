package com.inclineyou.inclineyou_backend.core.program.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * One workout of a program's tree (api-contract 1.1 Programs L3): placed on a
 * week and a day, holding exercises that hold sets. An alternative is an
 * {@link Exercise} with no {@code alternatives} key at all, which is how a
 * reader tells it from a main.
 */
public record PlanWorkout(String id, String name, String notes, int week, int day, int position,
                          List<Exercise> exercises) {

    public record Exercise(String id, String exerciseId, int position, String groupId, String section, String notes,
                           List<SetLine> sets,
                           @JsonInclude(JsonInclude.Include.NON_NULL) List<Exercise> alternatives) {}

    public record SetLine(String id, int position, String loadKind, Double loadValue, String effortKind,
                          Double effortValue, Integer restSeconds, String tempo, String notes) {}
}
