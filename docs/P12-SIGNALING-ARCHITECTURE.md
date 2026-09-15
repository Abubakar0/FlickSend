# P12 Signaling Architecture

## Control-Plane Boundary

P12 uses a Cloudflare Worker and Durable Object for live WebRTC negotiation only. The Worker relays bounded, validated SDP offer/answer and ICE-candidate control messages between one sender and one receiver. WebRTC DataChannels remain the payload path. The Worker, Durable Object, Railway application API, and PostgreSQL never receive normal payload bytes, FSTP frames, file contents, filenames, paths, manifests, block hashes, or transfer history.

Railway hosts the authenticated application/API and PostgreSQL. Cloudflare hosts only ephemeral active signaling. There is no Durable Object to PostgreSQL connection and no database credential in Worker or browser code.

## Capability Admission

For a server-authenticated sender, the application resolves the sender's opaque Account and verifies the selected recipient is a currently connected P11 People relationship. It then issues two independently signed, role-bound, ten-minute capabilities for a randomly generated signaling session ID: a sender capability opens the sender signaling socket, and a receiver capability is carried by the P5-compatible `/receive/<capability>` route and opens the receiver socket.

The session ID is only an ephemeral signaling-room key. It is not a FSTP transfer identity, Account ID, database record, or relationship ID, and it is not persisted in PostgreSQL. Capability verification occurs in the Worker before the Durable Object is selected. The raw capability is removed from the request before forwarding; the Durable Object receives only the verified role and expiry.

## Room Lifecycle

The production room has bounded `CREATED / WAITING`, `PEER_JOINED / NEGOTIATING`, `CONNECTED`, `DISCONNECTED`, and `EXPIRED / CLOSED` lifecycle states. The same unexpired role capability may rejoin after a socket closes; a duplicate same-role socket replaces the older socket. Expiry or explicit revocation closes active sockets and blocks later joins.

WebSocket hibernation attachments retain only role and expiry. There are no unbounded message queues. Control messages are schema-validated and limited to the protocol maximum (16 KiB). Invalid JSON, invalid message variants, and oversized messages receive a bounded error and are not forwarded.

## Transfer Continuity

The `ConnectionCoordinator` P12 admission seam changes only the WebSocket URL and authorization token. It does not modify FSTP, M4 resume, M5 integrity, M6 StreamPack, M7 route recovery, or engine delivery state. A signaling reconnect reuses the same capability/session context and cannot generate a new transfer identity. `DELIVERED` remains the engine's integrity-verified terminal state; a signaling room does not create or confirm product completion.

Existing M7 TURN behavior is retained for the legacy session path. P12 neither deploys production TURN nor claims new TURN performance qualification.
