# P14 TURN Security

P14 uses coturn's REST shared-secret mechanism with HMAC-SHA1 solely because coturn defines that
credential format. FlickSend block integrity remains SHA-256 and FSTP v4 behavior is unchanged.

## Credential boundary

- `TURN_SHARED_SECRET` stays in the Railway server secret store and coturn host deployment secret
  store only.
- The credential issuer validates the P12 capability before consulting Cloudflare eligibility.
- Issuance is rate-bounded per opaque capability token identifier in process memory; no capability,
  account identifier, credential, or transfer metadata is persisted.
- The browser gets only validated public ICE fields and must reject malformed or expired DTOs.
- Safe errors are limited to `FS_TURN_AUTH_FAILED`, `FS_TURN_RATE_LIMITED`, and
  `FS_TURN_CREDENTIAL_UNAVAILABLE`.

Guest capability is not a production account, a persistent relationship, a general relay entitlement,
or payload authorization. Relay eligibility is an additional bounded route-control decision only.

## Host boundary

coturn uses long-term REST credentials, fingerprinting, disabled CLI access, no multicast peers, no
loopback peers, and a bounded relay range. It must never be an open relay. Public TLS/TURNS, abuse
controls, monitoring, log retention, and rotation execution require the P14 external gate.
