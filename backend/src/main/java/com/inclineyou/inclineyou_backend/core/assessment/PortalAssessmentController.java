package com.inclineyou.inclineyou_backend.core.assessment;

import com.inclineyou.inclineyou_backend.core.assessment.dto.PortalAssessment;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * The client's assessments (api-contract 1.2, pa-l1 … pa-a2). {@code SecurityConfig} admits a client session to {@code /v1/portal/**};
 * {@code PortalAccess} refuses a paused or removed client with the wall's own code. STANDARD tier.
 */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalAssessmentController {

    private final PortalAssessmentService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static ResponseEntity<PortalAssessment.Detail> detail(PortalAssessment.Detail d, HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).eTag("\"" + d.version() + "\"").body(d);
    }

    @GetMapping("/assessments")
    public ResponseEntity<PortalAssessment.Page> list(@RequestParam String state, @RequestParam(defaultValue = "20") int limit,
                                                      @RequestParam(required = false) String cursor, @RequestParam(required = false) String include) {
        boolean counts = include != null && java.util.Arrays.asList(include.split(",")).contains("counts");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(phone(), state, limit, cursor, counts));
    }

    @GetMapping("/assessments/{id}")
    public ResponseEntity<PortalAssessment.Detail> one(@PathVariable UUID id) {
        return detail(service.get(phone(), id), HttpStatus.OK);
    }

    @PutMapping("/assessments/{id}/entry")
    public ResponseEntity<PortalAssessment.Detail> entry(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                         @Valid @RequestBody PortalAssessment.Entry req) {
        return detail(service.put(phone(), id, ifMatch, req), HttpStatus.OK);
    }

    @GetMapping("/assessment-templates")
    public ResponseEntity<PortalAssessment.Templates> templates() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).eTag("\"" + service.templatesVersion(phone()) + "\"").body(service.templates(phone()));
    }

    @PostMapping("/assessments")
    public ResponseEntity<PortalAssessment.Detail> start(@Valid @RequestBody PortalAssessment.Start req) {
        var s = service.start(phone(), req);
        return detail(s.detail(), s.created() ? HttpStatus.CREATED : HttpStatus.OK);
    }
}
