# Architecture Decision Records

M0 adopts the product-level decisions from the master specification. Detailed implementation ADRs
are required before changing any of these decisions or beginning the relevant milestone.

| ADR | Decision                                                                                   | Status                        |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------- |
| 000 | Run FlickSend from a dedicated repository root, independent of the unrelated TWS project.  | Accepted                      |
| 001 | Browser-first, not browser-only.                                                           | Accepted                      |
| 002 | Control plane separated from data plane.                                                   | Accepted                      |
| 003 | WebRTC DataChannel is the primary direct transport.                                        | Accepted                      |
| 004 | Transfer identity is independent of transport identity.                                    | Accepted                      |
| 005 | Small network frames and larger resume blocks.                                             | Accepted; sizes unmeasured    |
| 006 | Block-level integrity and missing-block resume.                                            | Accepted                      |
| 007 | StreamPack rather than archive-first folder transfer.                                      | Accepted; deferred to M6      |
| 008 | OPFS/local storage only for recovery metadata.                                             | Accepted; deferred            |
| 009 | PostgreSQL for control-plane state.                                                        | Accepted; deferred            |
| 010 | REST/OpenAPI control API.                                                                  | Accepted; deferred            |
| 011 | Persistent cryptographic device identity.                                                  | Accepted; deferred            |
| 012 | Dedicated coturn TURN fallback.                                                            | Accepted; deferred to M7      |
| 013 | WebTransport is a benchmarked server-relay candidate.                                      | Accepted; deferred            |
| 014 | Native Turbo is deferred until evidence establishes a need.                                | Accepted                      |
| 015 | Offline cloud delivery is deferred.                                                        | Accepted                      |
| 016 | Mesh is deferred.                                                                          | Accepted                      |
| 017 | Privacy-minimized telemetry.                                                               | Accepted                      |
| 018 | Integrity before speed.                                                                    | Accepted                      |
| 019 | Use TypeScript 6.0.3 until the current `typescript-eslint` supports TypeScript 7.          | Accepted                      |
| 020 | Use Cloudflare Durable Objects for temporary two-peer M1 signalling sessions.              | Accepted                      |
| 021 | Keep M1 signalling JSON bounded to 16 KiB and WebRTC payload out of the Worker.            | Accepted                      |
| 022 | Persist temporary peer role by ephemeral peer ID to support signalling reconnect.          | Accepted                      |
| 023 | Bound M3 read-ahead and receiver writes with receiver flow control.                        | Accepted                      |
| 024 | Persist M4 committed-block maps before M5 block-integrity claims.                          | Accepted                      |
| 025 | Activate one live FSTP v3 recovery pipeline for Engine Lab M4B.                            | Accepted                      |
| 026 | Make FSTP v4 verified delivery mandatory for active single-file Engine Lab transfers.      | Accepted                      |
| 027 | Use virtual StreamPack folders with FSTP v5, portable paths, and bounded writers.          | Accepted                      |
| 028 | Keep direct/relay route selection outside FSTP with guarded route generations.             | Accepted                      |
| 029 | Issue short-lived coturn REST credentials from the signaling Worker.                       | Accepted; production deferred |
| 030 | Bound ICE restart and use guarded PeerConnection replacement for route recovery.           | Accepted                      |
| 036 | Separate browser feature detection from qualification evidence.                            | Accepted                      |
| 037 | Do not replace streaming destinations with Blob or OPFS payload caches.                    | Accepted                      |
| 038 | Keep Safari and mobile evidence separate from engine emulation.                            | Accepted                      |
| 039 | Retain FlickSend internally pending counsel review.                                        | Accepted                      |
| 040 | Establish a presentation-only, brand-swappable P3 design system.                           | Accepted                      |
| 041 | Keep P4 sender orchestration in an application controller outside React and the engine.    | Accepted                      |
| 042 | Keep P5 recipient authorization, destination selection, and engine orchestration separate. | Accepted                      |
| 047 | Use PostgreSQL/Prisma for metadata-only P11 persistence behind server repositories.        | Accepted                      |
| 048 | Store P12 invitation bearer links as digest-only, bounded-lifetime relationship requests.  | Accepted                      |
| 049 | Use signed role capabilities with hibernating Durable Objects for P12 signaling.           | Accepted                      |
| 050 | Separate Cloudflare signaling names, origins, and bindings by P13 environment.             | Accepted                      |
| 051 | Issue P14 coturn REST credentials from Railway after Worker eligibility verification.      | Accepted                      |
| 052 | Permit capability signaling sessions to use an injected ICE configuration provider.        | Accepted                      |
