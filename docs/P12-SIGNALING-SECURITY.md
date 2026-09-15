# P12 Signaling Security

## Capabilities

Capabilities use the `fsst1.<base64url-claims>.<HMAC-SHA-256>` form. Worker verification requires version `1`, a UUID signaling-session ID, sender or receiver role, a 16-byte random token identifier, a current bounded expiry, and a valid HMAC using `SIGNALING_CAPABILITY_SECRET`. The secret must be at least 32 UTF-8 bytes and exists only in the Railway application runtime and the Cloudflare Worker secret store.

Capabilities are bearer credentials for a narrowly bounded live signaling room, not reusable account sessions. They carry no provider token, email, Account ID, transfer ID, source/destination metadata, filename, path, payload, or TURN credential. Server-side Connected People eligibility is checked before sender capability issuance; connected status alone never permits arbitrary signaling-room access.

## Revocation And Expiry

The Worker accepts an explicit capability-authenticated revoke operation. It writes only a revocation-until time to the addressed Durable Object, closes active room sockets, and rejects later joins until capability expiry. Expiry uses a Durable Object alarm with the same cleanup behavior. The raw capability is verified at the Worker boundary and is never forwarded to Durable Object URL, headers, attachments, or storage.

P12 does not redefine frozen P4/P5 cancel/delivery behavior. Any later product operation that invokes signaling revocation must remain a server-scoped control-plane action and must not treat revocation as an engine delivery or integrity result.

## Input And Abuse Controls

- Invitation tokens have strict syntax and are looked up by SHA-256 digest only.
- Invitation mutation uses authenticated server Account authority and serializable transactions.
- Invitation replay, self-acceptance, expiry, decline, revocation, blocked relationships, and foreign revocation fail without revealing People metadata.
- Worker admission validates signing, version, role, expiry, and bounded claim sizes before a room lookup.
- A room permits one active sender and one active receiver; a same-role reconnect replaces only that role's old socket.
- Only schema-valid bounded JSON signaling variants can cross role boundaries. The room never accepts control-plane status messages from a peer as relay input.
- SDP, ICE candidates, tokens, database URLs, provider subjects, payload, and file metadata are not logged.

## Known Limits

Bearer link leakage before expiry permits the holder to use the exact capability's role. The scope is constrained to one short-lived ephemeral signaling room and can be revoked. P12 provides no application-layer payload encryption, offline delivery, persistent signaling history, analytics, production TURN deployment, or platform/throughput claim. Production deployment still requires an operator-owned Cloudflare Worker and secret configuration.
