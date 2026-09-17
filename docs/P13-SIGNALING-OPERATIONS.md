# P13 Signaling Operations

The signaling Worker is a bounded control plane. Normal payload bytes remain WebRTC DataChannel traffic
between peers and never pass through Cloudflare or Railway application APIs.

## Safe operations

- Use `GET /health` for reachability; expect only status, environment, and build version.
- Enforce exact configured browser origins, bounded request rates, and the existing short-lived P12
  capability admission rules.
- Rotate the capability secret through provider-managed secrets. Deploy the new secret in a reviewed
  maintenance window, recognize that prior signed capabilities become invalid, and issue fresh
  invitations/sessions where required.
- Revoke a signed session through the existing authenticated server route. Do not use Worker internals
  or Durable Object inspection as a product control surface.
- Roll back only to a compatible reviewed Worker release; preserve DO migrations and state boundaries.

## Incident boundary

Fail closed with the existing generic signaling-unavailable result for invalid environment configuration,
origin rejection, malformed protocol input, rate limit exhaustion, unavailable Durable Objects, or relay
eligibility failure. Do not expose raw provider errors, request bodies, capabilities, session IDs,
candidate addresses, SDP, or payload metadata in browser copy or logs.

Operational logs may record only provider-managed, privacy-reviewed service health events. They are not
FlickSend analytics or product history and must not be copied into application persistence.

## External gate

The repository validates the Worker implementation and dry-run binding configuration. Persistent
Cloudflare staging admission, reconnect, revocation, origin, and health evidence is a separate P13
external qualification gate.
