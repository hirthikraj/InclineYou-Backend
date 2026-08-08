package com.trainx.trainx_backend.client;

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
