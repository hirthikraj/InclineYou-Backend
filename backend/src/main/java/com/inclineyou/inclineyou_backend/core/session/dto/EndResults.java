package com.inclineyou.inclineyou_backend.core.session.dto;

import java.util.List;

/** The same {@code results[]} shape as {@link MarkResults} — 1.1 gave the two batch routes one answer. */
public record EndResults(List<EndResult> results) {}
