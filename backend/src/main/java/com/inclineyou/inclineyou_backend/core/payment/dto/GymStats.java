package com.inclineyou.inclineyou_backend.core.payment.dto;

public record GymStats(String floorBilled, long floorSessions, String gymCut, double gymCutPercent,
                       String remoteBilled, long remoteSessions, String yours) {}
