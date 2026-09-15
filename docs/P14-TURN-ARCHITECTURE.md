# P14 TURN Architecture

P14 adds a server-owned path for issuing ephemeral browser ICE configuration. It does not route payload
through Railway, Cloudflare, or an application API.

1. A P12 sender or guest-recipient capability reaches the Railway credential route.
2. Railway verifies its signature, bounded lifetime, role, and opaque token identifier server-side.
3. Railway sends the signed capability and a domain-separated proof to the deterministic Cloudflare
   relay-eligibility endpoint.
4. Cloudflare returns only the safe eligibility category. Railway creates a coturn REST credential
   using the shared secret held only on the server.
5. The browser receives the validated `ClientIceConfiguration`: STUN/TURN public URLs, temporary
   username, temporary credential, and expiry.
6. The WebRTC adapter uses `all` policy for `AUTO` and `relay` only for existing `RELAY_ONLY` recovery.

The adapter never posts peer IDs, legacy session codes, account IDs, transfer IDs, diagnostics, or the
coturn shared secret. Every route replacement requests a fresh ephemeral configuration; that renewal
does not create a new FlickSend transfer identity.

The engine remains framework- and provider-independent. It merely accepts an ICE configuration
provider; P14 keeps authorization, capability validation, HTTP, and coturn credential derivation in
the application layer.
