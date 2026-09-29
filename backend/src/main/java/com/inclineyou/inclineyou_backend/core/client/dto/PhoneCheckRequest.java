package com.inclineyou.inclineyou_backend.core.client.dto;

import com.inclineyou.inclineyou_backend.shared.util.Text;
import jakarta.validation.constraints.NotBlank;

/** {@code POST /v1/clients/phone-check} (A4). Format is the guard's verdict, not a 400. */
public record PhoneCheckRequest(@NotBlank(message = "required") String phone) {
    public PhoneCheckRequest {
        phone = Text.strip(phone);
    }
}
