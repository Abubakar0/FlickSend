# Browser Capabilities

`@flicksend/browser-capabilities` is a browser-only, framework-independent feature-detection layer.
It has no dependency on `engine-core`, FSTP, React, Next.js, filesystem payload adapters,
authentication, database, or UI components. Engine Lab consumes its typed snapshot to explain safe
available actions and limitation reason codes.

## Snapshot

`detectBrowserCapabilities()` returns `BrowserCapabilitySnapshot` with three-valued availability:
`AVAILABLE`, `UNAVAILABLE`, or `UNKNOWN`. `UNKNOWN` is required when a static probe cannot safely
answer a dynamic question, including selected-pair RTT, browser bitrate estimates, background
behavior, and reload/restart handle restoration.

The snapshot contains identity context, WebRTC DataChannel/stats, file and directory selection,
drag-and-drop, direct file/directory writing, OPFS, storage estimate and persistence state, WebCrypto
SHA-256, workers, Wake Lock, and derived transfer modes. `navigator.storage.estimate()` is recorded
only as an estimate; it is never described as free disk space.

The detector does not open a picker, request persistence, request Wake Lock, create an ICE route, or
write any file. SHA-256 is checked against an empty bounded value. User-agent parsing labels evidence
with browser/OS information only; it is never used as a support gate.

## Decision Boundary

`runtimeCompatibility()` produces typed reason codes for missing required and optional capability
classes. It intentionally never returns `FULL_SUPPORT`: a runtime feature probe cannot prove
destination permission semantics, integrity recovery, TURN, lifecycle behavior, or browser-specific
correctness.

The current mode derivation is conservative:

- File sending requires WebRTC DataChannel, WebCrypto SHA-256, and file selection.
- Folder sending additionally requires a directory-selection API.
- Single-file receiving additionally requires a streaming selected-file destination API.
- Folder receiving additionally requires a selected-directory destination API.
- In-session resume requires a safe destination and OPFS metadata support.
- Resume after reload remains `UNKNOWN` until real permission-reselection evidence exists.

The transfer engine does not consume these diagnostics. Missing capability data cannot alter a frame,
integrity result, recovery record, or `DELIVERED` transition.

## V1 Compatibility Scope

Initial V1 is Windows-first desktop: Chrome stable and Edge stable on Windows are the primary M9
qualification targets. Firefox stable on Windows is secondary and may remain
`SUPPORTED_WITH_LIMITATIONS` where its real-browser evidence warrants it. Chrome macOS, Safari macOS,
Firefox macOS, Android Chrome, and Safari on iOS/iPadOS are `NOT TESTED` and `NOT YET QUALIFIED`; a
capability snapshot from any of those platforms is diagnostic information, not a V1 support claim.

The detector never performs browser-name blocking. It may expose a safe action where a runtime feature
exists, but product, SEO, and UI compatibility copy must remain disabled until the target has retained
real-platform qualification evidence.

## Safe Fallbacks

No browser gets a whole-file Blob fallback. No browser gets an implicit OPFS giant-payload fallback.
When direct incremental destination APIs are unavailable, the UI reports the corresponding capability
reason and does not begin an unsafe receive flow. Folder fidelity is limited when the source cannot
enumerate empty directories; it is not fabricated.

## Qualification Layers

1. Unit tests cover identity labeling, unknown dynamic fields, reason codes, and the rule that feature
   detection cannot grant `FULL_SUPPORT`.
2. Browser-engine automation validates an installed actual browser executable and records its version.
3. Real browser/device qualification validates user permissions, filesystem behavior, TURN, lifecycle,
   and hardware/OS interactions.

Only the third layer can qualify Safari or a real mobile device. The M9 runner keeps these layers
separate in its artifact metadata. macOS and mobile harnesses are retained for future evidence, but
their absence does not block the deliberately Windows-first V1 M9 gate.

## Assisted Filesystem Evidence

Engine Lab has an explicit M9 assisted filesystem export for real picker sessions. It records only
aggregate permission states, bounded-write usage, destination size/tree results, canonical-NFC status,
verified-root state, and safe continuity counts. File names, paths, transfer IDs, and payload bytes are
excluded.

The export is metadata-only: its use of a Blob creates a small JSON download and is unrelated to bulk
payload handling. The importer validates browser/OS identity and a pre-existing same-browser core
artifact before it can augment a matrix record. See [M9 assisted qualification](M9-ASSISTED-QUALIFICATION.md)
for the required real-user procedure.
