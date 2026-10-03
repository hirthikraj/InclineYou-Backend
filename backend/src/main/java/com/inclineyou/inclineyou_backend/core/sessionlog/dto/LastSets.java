package com.inclineyou.inclineyou_backend.core.sessionlog.dto;

import java.util.List;

/** The client's most recent COMPLETED session containing this exercise; date is a calendar date in the workspace's zone. */
public record LastSets(String date, List<SetValue> sets) {}
