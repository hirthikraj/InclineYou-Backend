package com.inclineyou.inclineyou_backend.shared.wire;

/**
 * The body of a verb that takes no fields. It exists so that a key sent anyway
 * is refused with 400 (strict binding, {@code JacksonConfig}) rather than
 * silently ignored — the caller meant something by it.
 */
public record EmptyBody() {}
