package com.inclineyou.inclineyou_backend.core.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ActivityItem(String kind, long at, String clientId, String clientName, String amount,
                           String method, String packageId, String packageName,
                           @JsonIgnore String cursorKey,
                           @JsonIgnore String id) {}
