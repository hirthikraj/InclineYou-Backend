package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalHome;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The client portal's home (api-contract 1.2, p-a2): a live arrangement is required; a paused or removed client is a 403 naming the wall. */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalHomeController {

    private final PortalHomeService home;

    @GetMapping("/home")
    public ResponseEntity<PortalHome> home() {
        String phone = SecurityContextHolder.getContext().getAuthentication().getName();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(home.home(phone));
    }
}
