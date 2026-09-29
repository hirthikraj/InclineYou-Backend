package com.inclineyou.inclineyou_backend.infrastructure.config;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

/**
 * Request bodies bind strictly, app-wide — the rule the Map-parsing services
 * enforced by hand before request bodies became records (29 Sep 2026):
 *
 * <ul>
 *   <li>an unknown key is a 400, not silently dropped — a typo'd field name
 *       answering 200 is a save that did nothing;</li>
 *   <li>{@code 5.5} is not an {@code Integer} (Jackson would truncate it to 5);</li>
 *   <li>{@code "5"} is not a number, {@code "true"} not a boolean, and
 *       {@code 5} not a string.</li>
 * </ul>
 *
 * {@code GlobalExceptionHandler#handleUnreadable} turns each refusal into
 * {@code 400 VALIDATION} naming the field. A record that must tolerate extra
 * keys (a seed file, say) opts out with {@code @JsonIgnoreProperties(ignoreUnknown = true)}.
 */
@Configuration
public class JacksonConfig {

    @Bean
    JsonMapperBuilderCustomizer strictRequestBodies() {
        return builder -> builder
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .withCoercionConfig(LogicalType.Textual, c -> c
                        .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                        .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                        .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail));
    }
}
