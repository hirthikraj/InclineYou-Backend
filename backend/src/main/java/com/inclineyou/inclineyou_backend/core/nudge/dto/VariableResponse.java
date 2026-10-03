package com.inclineyou.inclineyou_backend.core.nudge.dto;

/** {@code label} is the contract's word; {@code meaning} is what 1.0 called it and stays for old callers. */
public record VariableResponse(String token, String label, String meaning) {}
