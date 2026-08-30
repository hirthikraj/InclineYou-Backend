package com.xrep.xrep_backend.trainer;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Stores {@link WorkMode} as the same lowercase strings V23 already wrote. */
@Converter
public class WorkModeConverter implements AttributeConverter<WorkMode, String> {

    @Override
    public String convertToDatabaseColumn(WorkMode mode) {
        return mode == null ? null : mode.value();
    }

    @Override
    public WorkMode convertToEntityAttribute(String value) {
        return value == null ? null : WorkMode.fromValue(value);
    }
}
