package com.inclineyou.inclineyou_backend.core.client.dto;

/**
 * {@code POST /v1/clients/{id}/lead-contacts}: the contact, and the client's follow-up date as it now stands (ISO, or null),
 * so the screen can redraw both from one answer. {@code created} is false on a replayed id (200, not 201) and is not on the wire.
 */
public record LeadContactSaved(LeadContact contact, String nextFollowUpOn,
                               @com.fasterxml.jackson.annotation.JsonIgnore boolean created) {}
