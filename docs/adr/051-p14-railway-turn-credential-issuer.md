# ADR 051: Use Railway as the P14 TURN Credential Issuer

## Status

Accepted for repository implementation; public TURN qualification remains blocked.

## Context

The browser needs short-lived coturn credentials without receiving the coturn shared secret. The
Cloudflare signaling Worker remains the authority for active signed-session relay eligibility, while
Railway already protects product server routes and can hold deployment secrets.

## Decision

Railway verifies the signed P12 capability, proves its request to the deterministic Cloudflare
eligibility endpoint, and issues a coturn REST credential using server-only HMAC-SHA1. It returns only
the validated `ClientIceConfiguration` DTO. Issuance is bounded per opaque capability token ID and
does not persist credentials, capabilities, account data, or transfer metadata.

## Consequences

The browser cannot obtain a relay credential directly from coturn or derive one from a shared secret.
`engine-core` receives only an ICE configuration provider and does not import Railway, React, accounts,
or signaling authorization. The design does not qualify a public coturn host, TLS/TURNS, or relay
performance.
