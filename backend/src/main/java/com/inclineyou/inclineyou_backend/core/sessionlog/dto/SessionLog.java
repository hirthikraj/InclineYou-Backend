package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import com.inclineyou.inclineyou_backend.core.session.SessionReadService;

import java.util.List;

/** Everything the console draws, in one read. {@code session} is the Schedule row (L4 shape). */
public record SessionLog(SessionReadService.SessionRow session, LogClient client, LogProgram program,
                         List<ExerciseEntry> exercises, Totals totals) {}
