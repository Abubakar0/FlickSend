# Production Infrastructure Boundary

M7 includes only a local coturn qualification compose service. Terraform remains deferred until a
production relay environment is introduced. Any production module must document public relay address
mapping, UDP/TCP/TLS ports and relay range, certificate lifecycle, short-lived shared-secret
credentials, secret rotation, rate limiting, network egress controls, privacy-safe observability,
and failover. Do not treat `services/turn/compose.yaml` as production infrastructure.
