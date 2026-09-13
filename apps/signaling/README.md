# FlickSend M1 Signalling

This Cloudflare Worker creates short-lived six-digit sessions and relays bounded SDP/ICE signalling
through Durable Objects. It must never receive normal WebRTC DataChannel payload bytes.

Run locally with pnpm --filter @flicksend/signaling dev. The local health endpoint is
http://127.0.0.1:8787/health.

## M7 TURN credentials

`POST /turn-credentials` is a development/control-plane credential endpoint, never a payload route.
It accepts a bounded session code and ephemeral peer UUID, confirms the peer was admitted to that
temporary session, then returns short-lived coturn REST credentials. The shared secret stays in the
Worker environment. `TURN_SHARED_SECRET`, `TURN_URLS`, optional `STUN_URLS`, and
`TURN_CREDENTIAL_TTL_SECONDS` (10-60 minutes, default 30) configure it. The endpoint returns 503
when TURN is not configured, so ordinary Engine Lab runs continue without a relay dependency.

`TURN_DEV_MODE=true` enables only the M7 qualification's invalid, expired, and unreachable negative
credential modes. It is not a production authorization mechanism. See `services/turn/README.md`.
