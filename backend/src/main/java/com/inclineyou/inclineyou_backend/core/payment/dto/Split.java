package com.inclineyou.inclineyou_backend.core.payment.dto;

/** The gym's and the trainer's part of a gym-desk payment, from {@code payment_trainer_share}. */
public record Split(String gym, String trainer) {}
