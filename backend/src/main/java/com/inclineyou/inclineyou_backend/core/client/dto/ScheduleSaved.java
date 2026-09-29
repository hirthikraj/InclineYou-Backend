package com.inclineyou.inclineyou_backend.core.client.dto;

import java.util.List;

/** What {@code PUT /v1/clients/{id}/schedule} answers. {@code clashes} is a warning: a batch is legal. */
public record ScheduleSaved(ClientSummary.Schedule schedule, List<ClientSummary.Slot> slots, int booked,
                            int cancelled, List<Clash> clashes) {

    public record Clash(int weekday, String start, String clientName) {}
}
