# Architecture

## Planes

FlickSend separates a metadata/control plane from a payload data plane. The future control plane
will manage accounts, devices, invitations, presence, signalling, receipts, and entitlements.
Normal direct payload bytes must never transit the Fastify application API.

The initial data route is WebRTC DataChannel, direct first, then TURN relay. Transfer identity is
stable and independent of transient network transport identity.

## M1 Package Boundaries

| Area                       | M0 state           | Dependency rule                                                      |
| -------------------------- | ------------------ | -------------------------------------------------------------------- |
| `engine-core`              | Active foundation  | Framework-independent; never import React, Next.js, auth, DB, or UI. |
| protocol                   | Active boundary    | Owns versioned signalling/control schemas and test-payload proof.    |
| transport-webrtc           | Active adapter     | Browser WebRTC adapter; no React, Next.js, auth, DB, or UI imports.  |
| signaling                  | Active edge app    | Cloudflare Worker/DO session and signal relay; never relays payload. |
| `shared`                   | Active foundation  | Small product metadata only; no engine coupling.                     |
| `engine-lab`               | Active application | Next.js UI shell; may consume engine public APIs only.               |
| Other listed packages/apps | Reserved           | Documented only until their assigned milestone.                      |

The dependency direction is engine-lab -> engine-core -> transport-webrtc -> protocol; the
separate signaling Worker also depends only on protocol. engine-core has no app or UI dependency.
The signalling service only creates temporary six-digit sessions and relays bounded SDP/ICE JSON
between two browser peers. It never receives normal DataChannel payload bytes.

## M1 Session Lifecycle

POST /sessions creates a random six-digit session code and opaque Durable Object identity with a
30-minute lifetime. The code is the human join handle; it is not the Durable Object name. A browser
connects to /session with code and peerId through WebSocket. The Durable Object persists the
offerer/answerer role for the peer's temporary UUID so a signalling reconnect does not create a
new transfer attempt. A session has at most two peers.

engine-core owns the connection lifecycle: signalling socket, WebRTC transport adapter, stable
ephemeral peer identity, negotiated state, bounded reconnect attempts, and route diagnostics. The
Engine Lab only renders snapshots and invokes public coordinator methods.

## M3 Data Path

The M3 path is browser File slice -> bounded read-ahead window -> versioned binary frame ->
DataChannel high/low-water gate -> binary WebRTC frame -> strict zero-copy payload view -> bounded
receiver write queue -> File System Access writable. The receiver acknowledges only successfully
written bytes and constrains sender advance through a bounded receive window. The normal receiver
never accumulates the file in a Blob; the in-memory destination is capped at 10 MiB and exists
solely for automated fixtures.

The hot-path ownership model is: File API allocates a bounded source `ArrayBuffer`; framing
allocates one header-plus-payload DataChannel buffer; WebRTC owns its internal send/receive copies;
the decoder creates a `Uint8Array` view with no application payload copy; a write batch uses the
original view when it contains one frame and otherwise makes one bounded batch allocation. React
only receives throttled metric snapshots, never payload buffers.

## Workspace Placement

FlickSend lives at the root of its own repository: `Documents/ChatGPT/FlickSend`. It has no source,
package-manager, or CI dependency on the unrelated TWS application. Its root GitHub Actions
workflow runs this project's commands directly.

## Toolchain Compatibility

M0 pins TypeScript 6.0.3 rather than TypeScript 7.0.2 because the current stable
`typescript-eslint` release rejects TypeScript 7. This is a toolchain compatibility decision, not
a change to the transfer architecture. Re-evaluate it when a security-patched lint stack supports
TypeScript 7.

# M5 Integrity Path

The active bounded-memory path is:

`source 8 MiB block -> sender SHA-256 -> FSTP v4 digest metadata -> <=64 KiB data frames -> receiver incremental SHA-256 and positional writes -> digest comparison -> persisted verified checkpoint -> canonical manifest root -> VERIFIED -> destination close -> DELIVERED`.

Only one logical block is retained by the sender at an acknowledgement boundary. The receiver keeps
only an incremental hasher plus existing frame/write buffers. Recovery metadata stores a compact
fixed-width base64 SHA-256 table, not payload bytes. `engine-core` owns all correctness transitions;
React only renders snapshots and can configure development-only fault injection.

# M6 StreamPack Folder Path

The active folder path is: directory handle enumeration -> canonical StreamPack manifest -> indexed
virtual logical stream -> 8 MiB v5 blocks -> at most 64 KiB FSTP frames -> receiver range writes ->
SHA-256 verified checkpoint -> FSPK folder root -> VERIFIED -> DELIVERED.

StreamPack owns policy only: canonical paths, deterministic UTF-8 ordering, sequential file IDs,
binary-search stream mapping, and root encoding. filesystem-browser owns directory handles and a
16-writer LRU destination cache. engine-core orchestrates manifest-first acceptance and block
commit; transport-webrtc carries opaque control and binary frames only. No archive is created and
payload memory is bounded to the active logical block plus normal frame/write buffers.

On recovery, the persisted v5 checkpoint remains receiver-authoritative: filesystem-browser first
re-hashes every committed block from the selected destination, then engine-core reconciles bounded
HAVE_VERIFIED_BLOCKS pages and sends only missing blocks. The transfer UUID and manifest identity
survive replacement WebRTC transports. The Engine Lab's held-reconnect controls are development
qualification hooks for deterministic mutation tests, not user-facing product workflow.

# M7 Route Layer

M7 adds a route layer beside, not inside, FSTP. `transport-webrtc` obtains browser-safe ICE
configuration and reduces selected candidate-pair stats to safe route diagnostics. `engine-core`
owns a monotonic route generation, bounded offerer-controlled PeerConnection replacement, direct
and relay attempt counters, and recovery timing. FSTP v4/v5 only observes a replacement transport;
it retains the same transfer ID, manifest identity, and receiver-authoritative verified checkpoint.

The normal policy is direct-first (`AUTO`). A relay-only policy is an Engine Lab qualification tool
that maps to WebRTC `iceTransportPolicy: "relay"`. A failed route uses at most two replacement
attempts with bounded timers and fresh short-lived credential requests. Stale callbacks are ignored
unless both their WebRTC transport and route generation remain current. Route telemetry contains
candidate classes, selected-pair state, protocol class, RTT and aggregate byte counters only: never
addresses, candidate SDP, TURN credentials, or payload metadata.

The signaling Worker remains control-plane only. It authenticates an active temporary session member
to receive coturn REST credentials; normal file/folder bytes continue only over WebRTC DataChannel.
Manual ICE restart is available for a still-viable PeerConnection and has an 8-second timeout. Route
failure uses the M4-proven full-replacement policy after a 2-second disconnected grace period; each
replacement has a 15-second connection timeout and at most two attempts with 500-millisecond
increasing backoff.

# M8 Transfer Health

M8 adds `@flicksend/transfer-health` beside the transfer engine, never inside its correctness path.
It is a pure TypeScript analyzer of typed aggregate engine measurements and safe selected-pair
WebRTC diagnostics. `engine-core` owns lifecycle-safe 500 ms sampling, route-generation checks,
bounded publication, and terminal SpeedProof creation. M5/M6 still own all send, integrity,
recovery, acknowledgement, finalization, and `DELIVERED` transitions.

The dependency direction is `engine-lab -> engine-core -> transfer-health`; `transfer-health` has
no WebRTC, filesystem, React, Next.js, authentication, database, or UI dependency. It never sees
payload bytes or private file metadata. Its source and destination values are bounded local adapter
work rates, not physical storage throughput. Read [TRANSFER-HEALTH.md](./TRANSFER-HEALTH.md) for
the measurement model and inference limits.

# M9 Browser Capability Layer

M9 adds `@flicksend/browser-capabilities` beside the transfer engine. It is a browser-only typed
feature detector with no dependency on `engine-core`, protocol framing, filesystem payload adapters,
React, Next.js, authentication, or storage services. Engine Lab reads its snapshot for capability
messaging; `engine-core` remains browser-agnostic and owns no browser-specific compatibility branch.

The detector reports `AVAILABLE`, `UNAVAILABLE`, or `UNKNOWN`. `UNKNOWN` is preserved for behavior
that only a live route, permission interaction, page lifecycle event, or real device can prove. Browser
identity is evidence metadata only; it is not a transfer-policy input. A capability snapshot cannot
grant product `FULL_SUPPORT`, cannot alter FSTP v4/v5, and cannot change integrity, recovery, or
`DELIVERED` behavior.

Direct user-selected files/directories remain the only intended large-payload destination model. OPFS
is limited to recovery metadata and explicitly bounded Engine Lab fixtures. Missing streaming
destination capability is surfaced as a typed limitation; no Blob or whole-payload fallback exists.

# M10 Physical Qualification Boundary

M10 adds `@flicksend/performance-qualification`, a pure TypeScript validator beside the engine. It
has no React, Next.js, WebRTC, filesystem, authentication, database, or UI dependency and does not
participate in FSTP, transfer lifecycle, integrity, recovery, routing, or `DELIVERED` decisions.
It validates evidence only after a transfer has reached its existing terminal state.

The `benchmarks/runner/m10-*.mjs` scripts are operator-side tooling outside the browser application.
They collect bounded external observations, sanitize local Engine Lab exports, and create immutable
artifacts. They cannot alter engine tuning or route selection. Raw inputs may contain a transfer ID
for local reconciliation, but retained M10 outputs intentionally omit it alongside host identifiers,
addresses, paths, filenames, raw payload data, and credentials.
