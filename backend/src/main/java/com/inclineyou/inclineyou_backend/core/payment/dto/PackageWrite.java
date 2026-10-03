package com.inclineyou.inclineyou_backend.core.payment.dto;

/** A package a sale or a renewal answers with, and whether this call made it (201) or a replay found it (200). */
public record PackageWrite(CurrentPackage pkg, boolean created) {}
