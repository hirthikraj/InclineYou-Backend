package com.inclineyou.inclineyou_backend.core.portal;

import com.inclineyou.inclineyou_backend.core.portal.dto.PortalMoney;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The client's package and money (api-contract 1.2, pm-l1 and pm-l2). Reads only; {@link PortalAccess} refuses a paused or removed client. */
@RestController
@RequestMapping("/v1/portal")
@RequiredArgsConstructor
public class PortalMoneyController {

    private final PortalMoneyService service;

    private static String phone() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/package")
    public ResponseEntity<PortalMoney.Package> pack() {
        return noStore(service.pack(phone()));
    }

    @GetMapping("/money")
    public ResponseEntity<PortalMoney.Money> money(@RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String cursor) {
        return noStore(service.money(phone(), limit, cursor));
    }
}
