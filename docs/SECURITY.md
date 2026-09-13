# Security

## M1 Position

M1 uses a temporary Cloudflare Durable Object only to map a short code to an opaque session and
relay bounded SDP/ICE signalling between two browsers. It does not receive normal DataChannel
payload bytes, user files, filenames, paths, accounts, credentials, or telemetry. Peer IDs are
ephemeral browser-session UUIDs and session records expire after 30 minutes.

Signalling schemas are validated at both the Worker and browser boundary. Malformed or oversized
signals cause an explicit error; they are not forwarded. The Engine Lab diagnostics show candidate
types, protocol, and RTT only, never candidate addresses.

## Non-Negotiables

- Never silently accept corruption or mark `DELIVERED` before required integrity verification.
- Validate every future untrusted path, manifest, size, offset, and frame field.
- Do not log file contents, private keys, filenames, or full source paths by default.
- Use standard reviewed cryptography only; application-layer encryption remains a future security
  and performance experiment.
- Keep credentials, auth vendor state, billing, and database concerns outside `engine-core`.

M1 is not an authorization system. Anyone who learns a live code can attempt to join before the
room is full. Authentication, guest-link controls, TURN credentials, persistence, abuse controls,
and production observability remain explicitly deferred.

# M5 Integrity Controls

M5 detects accidental/corrupt payload divergence between sender hashing and receiver bytes. It does
not claim application-layer encryption, malicious-source protection, or audited end-to-end
encryption. Digest/root metadata is strictly schema-validated: SHA-256 only, 64 lowercase hex
characters, bounded block count, exact offset/length layout, and bounded canonical manifest size.

Digest comparisons use a fixed-length XOR accumulator over 32-byte SHA-256 values to avoid an
early-exit comparison in portable browser code. Malformed metadata, absent expected digests,
inconsistent persisted digest tables, mismatches, and exhausted retries fail explicitly.

# M6 StreamPack Controls

Before filesystem creation, receiver validation rejects absolute paths, backslashes, dot components,
traversal, NUL, malformed separators, reserved portable names, trailing dots/spaces, excessive
depth, overlong paths, duplicate paths, case-fold collisions, invalid IDs, impossible sizes, and
malformed block metadata. The selected root is recreated below the chosen destination; sender paths
are never used as absolute destination paths.

StreamPack transfers no symlinks, permissions, ownership, ACLs, extended attributes, or archive
metadata. A receiver cannot trust a previous verified folder checkpoint solely by its recovery map:
the browser adapter re-hashes each committed logical block from the chosen destination before v5
recovery continues. Source metadata is re-enumerated before resume and read-time file mutation fails
explicitly.

If the source changes after interruption, v5 fails `FS_STREAMPACK_SOURCE_CHANGED`. If a persisted
destination block no longer hashes to its verified digest, v5 fails
`FS_STREAMPACK_DESTINATION_CHANGED`; it does not reuse the checkpoint or deliver the folder. Both
failure paths propagate a protocol failure to the peer and preserve the rule that only independently
verified destination state can reach DELIVERED.

# M7 TURN Controls

The Worker mints coturn REST credentials with `base64(HMAC-SHA1("expiry:peer-id", sharedSecret))`.
The shared secret is server-side only; browser responses contain a short-lived username/password and
bounded TURN/STUN URL lists. The TTL is constrained to 10-60 minutes (30 minutes by default). A
credential request is limited to 1 KiB, requires a validated temporary session admission, and is
rate-limited per peer. The Worker does not log credentials, candidate strings, addresses, filenames, paths, or
payload contents.

`invalid`, `expired`, and `unreachable` credential modes exist solely for the local M7 qualification
runner and are rejected unless `TURN_DEV_MODE=true`. The local coturn compose configuration has no
TLS certificate and is not production deployment guidance. Production still needs trusted TURN/TLS
certificates, public relay address mapping, firewalling, secret rotation, abuse controls, monitoring,
and incident logging policy. Application-layer payload encryption remains not started.

# M8 Transfer Health Controls

Transfer Health is local observability, not analytics. Its typed input excludes payload bytes,
filenames, paths, session codes, candidate strings, addresses, TURN credentials, and ICE SDP. It
accepts only aggregate byte counters, measured engine rates/queues, route class, RTT, and a browser
bitrate estimate when the browser exposes one. `null` represents unavailable data and must not be
silently converted into zero.

SpeedProof exports the same privacy-safe aggregate model. It is neither a billing meter nor an
authorization, delivery, or integrity decision. Failed WebRTC statistics sampling is non-fatal and
does not downgrade verified transfer correctness.

# M9 Compatibility Controls

Compatibility snapshots and M9 artifacts may contain browser family/version, operating-system family
and version, architecture where available, feature states, reason codes, and safe aggregate transfer
outcomes. They must not contain filenames, paths, payload bytes, candidate strings, SDP, IP addresses,
TURN credentials, session codes, or physical-storage claims.

The assisted M9 filesystem exporter is limited to the same aggregate fields. It may export permission
state, bounded-write confirmation, destination size/tree result, and manifest-root result, but excludes
selected names, external paths, transfer IDs, and payload content. Its JSON Blob is diagnostic metadata,
not a payload fallback.

Browser identity is used only to label evidence. It must not silently block a browser or weaken the
transfer path. Missing destination APIs cannot trigger a whole-file Blob, in-memory, or OPFS payload
fallback; that would violate bounded-memory and verified-delivery controls. Unavailable dynamic route
statistics are represented as unavailable rather than zero and do not affect transfer correctness.

# P1 Product Security Boundary

The frozen V1 product contract requires sender authorization, bounded authorized guest access,
per-transfer authorization that People relationships cannot bypass, later abuse/rate controls, and
integrity-gated completion. P1 does not implement authentication, guest invitations, databases, or
production security operations. The user-facing and data-minimization rules are in
[PRODUCT-DEFINITION-V1.md](PRODUCT-DEFINITION-V1.md),
[ERROR-TAXONOMY.md](ERROR-TAXONOMY.md), and [DEFERRED-RISKS.md](DEFERRED-RISKS.md).
