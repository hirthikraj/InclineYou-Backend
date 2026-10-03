package com.inclineyou.inclineyou_backend.core.payment.dto;

public record PracticeMonth(String month, int delivered, int noShows, int cancelled, int activeClients,
                            int newClients, int archived, String billed, String collected, String takeHome) {}
