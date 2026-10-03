package com.inclineyou.inclineyou_backend.core.trainer.dto;

/**
 * The number the account is signed in with now. There is no token here any more
 * (v1.1): the web never gets a new credential from this call — the session that
 * made the change survives — so a field that was always null told a caller nothing.
 */
public record PhoneChangedResponse(String phone) {}
