package com.inclineyou.inclineyou_backend.core.progress.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code sessions} is keyed by session id and holds only the sessions that appear on THIS page — the same idiom as
 * {@code exercises}, so a client's 5,000-set page doesn't repeat a workout name 5,000 times. Appended last: every
 * existing field keeps its place.
 */
public record History(Map<String, Exercise> exercises, List<SetRow> items, String nextCursor,
                      Map<String, SessionInfo> sessions) {}
