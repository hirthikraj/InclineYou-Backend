package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.auth.AuthTokenFilter;
import com.inclineyou.inclineyou_backend.core.portal.dto.PortalSettings;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The client's settings and privacy (api-contract 1.2, ps-l1 … ps-a4). {@link PortalAccess} refuses a paused or removed client on the routes that
 * need a live arrangement; leave (a repeat), the data download and account deletion are open to a removed client, which is the point of them.
 */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalSettingsController {

    public static final String TICKET_HEADER = "X-Step-Up-Ticket";

    private final PortalSettingsService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static ResponseEntity<PortalSettings.Prefs> prefs(PortalSettings.Prefs p) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag("\"" + p.version() + "\"").body(p);
    }

    @GetMapping("/prefs")
    public ResponseEntity<PortalSettings.Prefs> prefs() {
        return prefs(service.prefs(phone()));
    }

    /** Absent = leave, null = clear, nested too: a request that names one switch cannot clobber the others. {@code If-Match} is honoured when sent. */
    @PatchMapping("/prefs")
    public ResponseEntity<PortalSettings.Prefs> patch(@Valid @RequestBody PortalSettings.PrefsPatch req, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return prefs(service.patch(phone(), req, ifMatch));
    }

    @GetMapping("/privacy")
    public ResponseEntity<PortalSettings.Privacy> privacy() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.privacy(phone()));
    }

    @PostMapping("/leave")
    public ResponseEntity<PortalSettings.Left> leave(@Valid @RequestBody PortalSettings.Leave req) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.leave(phone(), req));
    }

    /** The person's own data, as a file. Reachable from the removed wall; the heaviest read in the portal, so five an hour. */
    @GetMapping("/export")
    public ResponseEntity<byte[]> export() {
        String json = service.export(phone());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"inclineyou-data-" + LocalDate.now() + ".json\"")
                .body(json.getBytes(StandardCharsets.UTF_8));
    }

    /** Close the account. The proof is a step-up ticket in {@code X-Step-Up-Ticket} (the trainer's own convention) or, as the contract writes it, {@code {"ticket": …}}. */
    @DeleteMapping("/me")
    public ResponseEntity<Void> delete(@RequestHeader(value = TICKET_HEADER, required = false) String header, @RequestBody(required = false) PortalSettings.DeleteBody body,
                                       HttpServletRequest request) {
        String ticket = header != null && !header.isBlank() ? header : body == null ? null : body.ticket();
        service.deleteAccount(phone(), ticket, (String) request.getAttribute(AuthTokenFilter.TOKEN_ATTRIBUTE));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/push-subscriptions")
    public ResponseEntity<PortalSettings.Subscribed> subscribe(@Valid @RequestBody PortalSettings.Subscribe req) {
        var s = service.subscribe(phone(), req);
        return ResponseEntity.status(s.created() ? HttpStatus.CREATED : HttpStatus.OK).body(new PortalSettings.Subscribed(s.id().toString()));
    }

    @DeleteMapping("/push-subscriptions/{id}")
    public ResponseEntity<Void> unsubscribe(@PathVariable UUID id) {
        service.unsubscribe(phone(), id);
        return ResponseEntity.noContent().build();
    }
}
