package com.inclineyou.inclineyou_backend.core.report.dto;

/** Who the report is about and who it is from — null stays null; the service decides what a missing name reads as. */
public record ClientNames(String clientName, String trainerName) {}
