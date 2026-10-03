package com.inclineyou.inclineyou_backend.core.report.dto;

/** Sessions in the adherence window: kept (done) against planned (everything not cancelled). */
public record SessionStats(long done, long scheduled) {}
