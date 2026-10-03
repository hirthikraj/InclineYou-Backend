package com.inclineyou.inclineyou_backend.core.payment.dto;

/** The gym the trainer is with now: the name as a snapshot, and the directory place when it was picked. */
public record CurrentGym(String name, String placeId) {}
