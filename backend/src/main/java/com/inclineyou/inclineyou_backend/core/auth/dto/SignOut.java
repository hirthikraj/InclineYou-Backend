package com.inclineyou.inclineyou_backend.core.auth.dto;

/**
 * @param revoked false for a JWT, which expires on its own clock. The client
 *                should still clear its local copy; this only says whether
 *                the server can stop honouring it.
 */
public record SignOut(String tokenKind, boolean revoked) {}
