package com.inclineyou.inclineyou_backend.core.payment.dto;

public record TopClient(String clientId, String clientName, int sessions, String collected, String yours) {}
