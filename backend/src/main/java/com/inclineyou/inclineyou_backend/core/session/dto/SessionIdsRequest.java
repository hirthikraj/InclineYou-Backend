package com.inclineyou.inclineyou_backend.core.session.dto;

import java.util.List;

/** {@code POST /v1/sessions/end} and {@code /done}: one to fifty distinct session ids. */
public record SessionIdsRequest(List<String> sessionIds) {}
