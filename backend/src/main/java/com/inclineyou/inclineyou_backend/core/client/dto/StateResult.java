package com.inclineyou.inclineyou_backend.core.client.dto;

import java.util.Map;

/** What pause, resume, archive and unarchive answer (R72): the row, and what the verb did. */
public record StateResult(ClientSummary client, Map<String, Integer> effects) {}
