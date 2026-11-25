package com.inclineyou.inclineyou_backend.core.payment.dto;

/**
 * The gym statement for a span (23 Nov 2026, `release/business-module-plan.html` — "the proof"): what the trainer did for the
 * gym, from the trainer's own book. Money is a string, as on every money field.
 *
 * <p>{@code clientsCoached} and {@code sessionsDelivered} are gym clients' sessions the trainer marked done in the span.
 * {@code newSales} / {@code renewals} are gym-pack sales by start month — a renewal is a sale to a client who had bought a pack
 * before. {@code billedYouBrought} / {@code billedGymDesk} split what was billed by who found the client: the gym's front desk
 * ({@code client.lead_source = gym_desk}, V48) or anyone else, which is the trainer. {@code received} is what the gym paid the
 * trainer in the span (payouts, by the day they arrived).
 */
public record GymStatement(int clientsCoached, int sessionsDelivered, int newSales, int renewals,
                           String billedYouBrought, String billedGymDesk, String received) {}
