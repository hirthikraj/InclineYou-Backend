package com.inclineyou.inclineyou_backend.core.assessment;

import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The jsonb columns of an assessment, in and out of Java. Tolerant on the way
 * in — a key this build lacks must not fail a read — and null-free on the way
 * out, so an answer stores only the fields its question's kind used.
 *
 * <p>Nothing here ever reaches a response as a {@code JsonNode}: the wire is
 * written by Spring's own mapper, which would not know one from a bean.
 */
final class AssessmentJson {

    private AssessmentJson() {}

    private static final JsonMapper JSON = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            // A form written before a flag existed (or by hand, as the seeds do) has no key for it;
            // an absent boolean means false, and a stored form must stay readable.
            .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .changeDefaultPropertyInclusion(i -> i.withValueInclusion(JsonInclude.Include.NON_NULL))
            .build();

    static String write(Object v) {
        try {
            return JSON.writeValueAsString(v);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static <T> T read(String json, Class<T> type) {
        try {
            return JSON.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalStateException("unreadable " + type.getSimpleName() + " json", e);
        }
    }

    /** {@code readings}: measurement key → number, in stored order. */
    static Map<String, BigDecimal> readings(String json) {
        try {
            return JSON.readValue(json, new TypeReference<LinkedHashMap<String, BigDecimal>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("unreadable readings json", e);
        }
    }

    /** {@code answers}: question id → its stored fields, as plain maps for the raw {@code entry}. */
    static Map<String, Object> plainMap(String json) {
        try {
            return JSON.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("unreadable json object", e);
        }
    }

    static <T> T convert(Object from, Class<T> type) {
        return JSON.convertValue(from, type);
    }
}
