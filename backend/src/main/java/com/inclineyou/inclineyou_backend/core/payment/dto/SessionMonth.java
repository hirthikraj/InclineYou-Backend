package com.inclineyou.inclineyou_backend.core.payment.dto;

public record SessionMonth(String month, int delivered, int noShows, int cancelled, int active) {}
