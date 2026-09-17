# P13 Signaling Security

P13 keeps the existing P12 capability model: a short-lived signed role capability is verified by the
Worker before it enters a temporary signaling room. The browser may hold its assigned capability for
the session, but neither the client nor product state is a source of authorization truth.

## Required boundaries

- `SIGNALING_CAPABILITY_SECRET` exists only in Cloudflare and Railway server-side secret stores.
- The staging Worker permits only the exact Railway staging origin. Wildcards, arbitrary ports, and
  credential-bearing origins are rejected.
- Relay eligibility uses a server-to-server bearer capability plus the domain-separated HMAC proof
  `flicksend:relay-eligibility:v1\n<timestamp>\n<capability>`.
- The Worker passes only role and expiry to the Durable Object eligibility operation and returns only
  `ELIGIBLE`, `REJECTED`, or `UNAVAILABLE`.
- CORS, request sizes, route methods, rate accounting, and error responses are bounded and generic.

P13 does not grant payload access, override P5 invitation authorization, make an account relationship
eligible, authorize a transfer destination, or affect FSTP integrity or `DELIVERED` semantics.
