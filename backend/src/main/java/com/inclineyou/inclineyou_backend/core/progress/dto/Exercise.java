package com.inclineyou.inclineyou_backend.core.progress.dto;

/** One exercise's name, given once per page of set-history rather than once per set. */
public record Exercise(String name, String equipment, boolean custom) {}
