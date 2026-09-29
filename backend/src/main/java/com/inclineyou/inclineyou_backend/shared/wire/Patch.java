package com.inclineyou.inclineyou_backend.shared.wire;

import jakarta.validation.valueextraction.ExtractedValue;
import jakarta.validation.valueextraction.UnwrapByDefault;
import jakarta.validation.valueextraction.ValueExtractor;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.BeanProperty;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.annotation.JsonDeserialize;

import java.util.function.UnaryOperator;

/**
 * One field of a PATCH body, which has three states where a record has two:
 * the key absent (leave the column alone), the key sent as {@code null} (clear
 * it), and a value. On a request record the component is Java {@code null} when
 * absent and a {@code Patch} otherwise, whose {@link #value()} may be null.
 *
 * <p>{@code Optional<T>} cannot carry this: Jackson maps an absent key and a
 * JSON null to the same {@code Optional.empty()} (checked on 3.1.4).
 *
 * <p>Constraints go on the type argument — {@code Patch<@Size(max = 100) String>}
 * — and Bean Validation checks the value through {@link Extractor}, which is
 * registered in {@code META-INF/services}. An absent field is never validated;
 * a cleared one is validated as null, so {@code @NotNull} there means "may be
 * left out but not cleared".
 */
@JsonDeserialize(using = Patch.Deserializer.class)
public record Patch<T>(T value) {

    public static <T> Patch<T> of(T value) {
        return new Patch<>(value);
    }

    /** Normalise a sent value (strip it, say); a null one stays null. */
    public Patch<T> map(UnaryOperator<T> f) {
        return value == null ? this : Patch.of(f.apply(value));
    }

    /** For a compact constructor: normalise the field if it was sent at all. */
    public static <T> Patch<T> map(Patch<T> field, UnaryOperator<T> f) {
        return field == null ? null : field.map(f);
    }

    public static final class Deserializer extends ValueDeserializer<Patch<?>> {

        private final JavaType valueType;

        public Deserializer() {
            this(null);
        }

        private Deserializer(JavaType valueType) {
            this.valueType = valueType;
        }

        @Override
        public ValueDeserializer<?> createContextual(DeserializationContext ctxt, BeanProperty property) {
            JavaType wrapper = property != null ? property.getType() : ctxt.getContextualType();
            return new Deserializer(wrapper.containedTypeOrUnknown(0));
        }

        @Override
        public Patch<?> deserialize(JsonParser p, DeserializationContext ctxt) {
            return Patch.of(ctxt.readValue(p, valueType));
        }

        /** The key was sent as {@code null}: clear the column. */
        @Override
        public Patch<?> getNullValue(DeserializationContext ctxt) {
            return Patch.of(null);
        }

        /** The key was not sent: leave the column. */
        @Override
        public Object getAbsentValue(DeserializationContext ctxt) {
            return null;
        }
    }

    @UnwrapByDefault
    public static final class Extractor implements ValueExtractor<Patch<@ExtractedValue ?>> {
        @Override
        public void extractValues(Patch<?> originalValue, ValueReceiver receiver) {
            receiver.value(null, originalValue.value());
        }
    }
}
