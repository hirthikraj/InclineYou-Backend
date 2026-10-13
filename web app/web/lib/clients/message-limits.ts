/**
 * The longest a message to a client may be — the schema's `client_message_body` check. It lives here and not in
 * `message-actions.ts` because a `'use server'` file may export nothing but async functions, and the composer needs the
 * number to count against as much as the action needs it to refuse with.
 */
export const MAX_MESSAGE = 1000;
