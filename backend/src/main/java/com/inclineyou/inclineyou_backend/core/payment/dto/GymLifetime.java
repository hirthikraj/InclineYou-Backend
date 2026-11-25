package com.inclineyou.inclineyou_backend.core.payment.dto;

/**
 * Since the first gym-pack sale (23 Nov 2026): everything sold for the gym, the gym's part, the trainer's part, and what the
 * gym has paid the trainer. {@code since} is YYYY-MM, null when nothing has been sold.
 */
public record GymLifetime(String since, int sales, String billed, String gymCut, String yours, String received) {}
