# P14 TURN Qualification

## Repository-owned evidence

- coturn template static checks verify REST shared-secret auth, bounded relay ports, and no static
  secret value;
- local Docker compose configuration parsed and an ephemeral coturn container reached `running` before
  teardown;
- Railway issuer, route, browser adapter, sender/receiver injection, and capability-aware ICE provider
  tests execute locally; and
- `pnpm qualification:p14` emits a sanitized repository result.

## External evidence required

The P14 external gate requires a public coturn host with verified firewall reachability, relay
allocation over the intended public routes, real browser DataChannel delivery, receiver-verified
completion, stable transfer identity across recovery, expiry/renewal behavior, and safe failure when
relay allocation is unavailable. It must not claim physical performance or TLS/TURNS unless measured
and retained separately.

Local Docker proves only template wiring. It is not public routing, NAT, firewall, TLS, abuse-control,
or production operations evidence.
