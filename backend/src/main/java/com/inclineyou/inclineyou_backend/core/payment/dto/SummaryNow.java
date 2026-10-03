package com.inclineyou.inclineyou_backend.core.payment.dto;

public record SummaryNow(String pending, String overdue, int clientsOwing, int clientsOverdue) {}
