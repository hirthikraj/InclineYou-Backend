package com.inclineyou.inclineyou_backend.core.client;

import com.inclineyou.inclineyou_backend.core.client.dto.CreateMessageRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.EditMessageRequest;
import com.inclineyou.inclineyou_backend.core.client.dto.Message;
import com.inclineyou.inclineyou_backend.shared.wire.Page;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * The trainer's lines to a client (api-contract 1.2, tr-a7). Every route is a trainer's and the client must be theirs (404
 * otherwise). {@code STANDARD} tier: a message spends no WhatsApp message, because none is sent.
 */
@RestController
@RequestMapping("/v1/clients/{id}/messages")
@RequiredArgsConstructor
public class ClientMessageController {

    private final ClientMessageService messages;

    /** 201 the first time, 200 for a replay of the same {@code id}. */
    @PostMapping
    public ResponseEntity<Message> create(@PathVariable UUID id, @Valid @RequestBody CreateMessageRequest body) {
        var made = messages.create(trainerId(), id, body);
        return ResponseEntity.status(made.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .eTag(made.message().version()).body(made.message());
    }

    /** Newest first, keyset-paged. {@code readAt} comes back on every row. */
    @GetMapping
    public Page<Message> list(@PathVariable UUID id,
                              @RequestParam(required = false) Integer limit,
                              @RequestParam(required = false) String cursor) {
        return messages.list(trainerId(), id, limit, cursor);
    }

    /** The wording only, and only while it is unread. {@code If-Match} is honoured when sent. */
    @PatchMapping("/{messageId}")
    public ResponseEntity<Message> edit(@PathVariable UUID id, @PathVariable UUID messageId,
                                        @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @Valid @RequestBody EditMessageRequest body) {
        var row = messages.edit(trainerId(), id, messageId, body, ifMatch);
        return ResponseEntity.ok().eTag(row.version()).body(row);
    }

    @DeleteMapping("/{messageId}")
    public ResponseEntity<Void> delete(@PathVariable UUID id, @PathVariable UUID messageId) {
        messages.delete(trainerId(), id, messageId);
        return ResponseEntity.noContent().build();
    }

    private UUID trainerId() {
        return UUID.fromString(SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
