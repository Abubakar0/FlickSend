# P14 Production coturn Template

This directory contains provider-neutral deployment artifacts for a dedicated public coturn host. It is
not a deployment and does not make Railway suitable for public UDP relay traffic. Choose a host only
after verifying public UDP/TCP reachability for `3478` and the full `49160-49200` relay range.

## Deployment boundary

Copy `.env.example` to a host-local `.env`, set a distinct high-entropy `TURN_SHARED_SECRET`, and keep
that populated file outside source control, terminal history, browser code, application logs, and product
storage. `TURN_REALM` must be the approved deployment realm. `TURN_EXTERNAL_IP` must be the public
routable address mapped to the coturn host.

Run the template from this directory:

```sh
docker compose -f compose.production.yaml up -d
```

The compose file is equivalent to the portable `turnserver.conf.template`; use one authoritative
configuration path, not both simultaneously. The server uses coturn REST shared-secret authentication,
long-term credentials, fingerprints, disabled CLI access, bounded relay ports, and no multicast or
loopback peers. It must never run as an open relay or with static end-user credentials.

## Service boundary

Railway issues a short-lived browser ICE DTO only after validating the signed P12 capability and asking
the Cloudflare signaling authority whether relay use is eligible. The browser receives STUN/TURN URLs,
a temporary username, a temporary password, and expiry only. It never receives `TURN_SHARED_SECRET`, an
account identifier, signaling diagnostics, or coturn host administration controls.

Credential lifetime defaults to 30 minutes and is bounded to 10-60 minutes. Renewal is a new credential
request for the same authorized transfer session; it must not create a transfer identity, grant access to
an unauthorized guest, or turn into account persistence.

## Qualification status

Local Docker configuration only checks artifact wiring. Public relay allocation, browser DataChannel
delivery, firewall reachability, TLS/TURNS, physical performance, host monitoring, and production secret
rotation are **NOT QUALIFIED** until the P14 external gate runs against a real public host.

Use [firewall.md](firewall.md) before provisioning. Do not copy coturn logs or network metadata into
FlickSend application analytics, support data, or product persistence.
