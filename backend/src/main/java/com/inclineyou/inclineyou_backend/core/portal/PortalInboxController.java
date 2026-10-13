package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalInbox;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** The client's inbox (api-contract 1.2, pi-l1 … pi-a2). {@link PortalAccess} refuses a paused or removed client with the wall's own code. */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalInboxController {

    private final PortalInboxService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/messages")
    public ResponseEntity<PortalInbox.MessagePage> messages(@RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String cursor) {
        return noStore(service.messages(phone(), limit, cursor));
    }

    @PostMapping("/messages/{id}/read")
    public ResponseEntity<Void> readMessage(@PathVariable UUID id) {
        service.readMessage(phone(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/notes")
    public ResponseEntity<PortalInbox.NotePage> notes(@RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String cursor) {
        return noStore(service.notes(phone(), limit, cursor));
    }

    @GetMapping("/notices")
    public ResponseEntity<PortalInbox.NoticePage> notices(@RequestParam(defaultValue = "false") boolean unread, @RequestParam(defaultValue = "20") int limit,
                                                          @RequestParam(required = false) String cursor) {
        return noStore(service.notices(phone(), unread, limit, cursor));
    }

    @PostMapping("/notices/read")
    public ResponseEntity<Void> readNotices(@Valid @RequestBody PortalInbox.Read req) {
        service.readNotices(phone(), req);
        return ResponseEntity.noContent().build();
    }
}
