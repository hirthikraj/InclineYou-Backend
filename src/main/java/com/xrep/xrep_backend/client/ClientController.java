package com.xrep.xrep_backend.client;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/clients")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;

    @GetMapping
    public List<ClientService.ClientResponse> list() {
        return clientService.list(trainerId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClientService.ClientResponse create(@Valid @RequestBody ClientService.CreateClientRequest req) {
        return clientService.create(trainerId(), req);
    }

    /**
     * Is this number addable, before anything is written?
     *
     * The roster is written offline and pushed later, so a refusal that only
     * exists at push time reaches the trainer minutes after they typed the
     * number, on a screen they have long since left. This is the same rule asked
     * early, while the add form is still open and the answer is still useful. It
     * is an optimisation, not the enforcement — {@code create} and the sync push
     * both apply the rule again, because a phone with no signal skips this.
     *
     * Deliberately not a 4xx: nothing has failed, a question has been answered,
     * and a 200 keeps a network error distinguishable from a taken number.
     *
     * POST for a question that writes nothing, because the alternative puts a
     * phone number in a URL. Query strings are logged by everything they pass
     * through — the access log, the reverse proxy, Railway's request log — and
     * this particular number is not even the caller's own: it is somebody the
     * trainer is asking about, quite possibly another trainer. A body is not
     * secret, but it stays out of the places a URL ends up by default.
     */
    @PostMapping("/phone-availability")
    public ClientPhoneGuard.Verdict phoneAvailability(
            @Valid @RequestBody ClientService.PhoneCheckRequest req) {
        return clientService.checkPhone(trainerId(), req.phone());
    }

    @GetMapping("/{id}")
    public ClientService.ClientResponse get(@PathVariable UUID id) {
        return clientService.get(trainerId(), id);
    }

    @PutMapping("/{id}")
    public ClientService.ClientResponse update(@PathVariable UUID id,
                                               @RequestBody ClientService.UpdateClientRequest req) {
        return clientService.update(trainerId(), id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        clientService.delete(trainerId(), id);
    }

    @GetMapping("/{id}/body-metrics")
    public List<ClientService.BodyMetricResponse> listMetrics(@PathVariable UUID id) {
        return clientService.listMetrics(trainerId(), id);
    }

    @PostMapping("/{id}/body-metrics")
    @ResponseStatus(HttpStatus.CREATED)
    public ClientService.BodyMetricResponse addMetric(@PathVariable UUID id,
                                                      @Valid @RequestBody ClientService.BodyMetricRequest req) {
        return clientService.addMetric(trainerId(), id, req);
    }

    private UUID trainerId() {
        return UUID.fromString(
                SecurityContextHolder.getContext().getAuthentication().getName());
    }
}
