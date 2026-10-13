package com.inclineyou.inclineyou_backend.core.client;

/** Test-only door to the package-private token hash, so a test can check what was stored without the production class widening. */
final class ClientInviteServiceTestAccess {
    private ClientInviteServiceTestAccess() {}

    static String hash(String token) {
        return InviteToken.hash(token);
    }
}
