package com.inclineyou.inclineyou_backend.core.trainer.dto;

/** The directory row a trainer's profile points at — what {@code gymPlace} carries on the wire. */
public record GymPlaceView(String id, String placeId, String name, String address, String city, String mapLink) {}
