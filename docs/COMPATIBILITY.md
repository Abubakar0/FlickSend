# Compatibility

## V1 Target And Evidence Policy

Initial V1 is Windows-first desktop: Chrome stable on Windows and Edge stable on Windows are the
primary targets. Firefox stable on Windows is secondary and documented with its evidence limitations.
Chrome macOS, Safari macOS, Firefox macOS, Android Chrome, and Safari on iOS/iPadOS are `NOT TESTED`
and `NOT YET QUALIFIED`; no V1 product, SEO, or UI support claim is made for those platforms. Browser
feature detection enables safe UI choices but never upgrades a support tier without real-platform
qualification.

Support tiers are `FULL_SUPPORT`, `SUPPORTED`, `SUPPORTED_WITH_LIMITATIONS`, `RECEIVE_ONLY`, `UNSUPPORTED`, and `NOT_TESTED`. Playwright WebKit is not Safari evidence, mobile emulation is not real-device evidence, and unavailable environments become `NOT_TESTED`, never synthetic passes.

## Current Matrix

| Browser/device                              | Evidence                            | Tier                         | Core transfer                     | External filesystem                         | TURN                                        | Direct to TURN | Lifecycle                                                |
| ------------------------------------------- | ----------------------------------- | ---------------------------- | --------------------------------- | ------------------------------------------- | ------------------------------------------- | -------------- | -------------------------------------------------------- |
| Chrome 152.0.7977.83, Windows 10 x64        | Real stable browser, automated      | `SUPPORTED_WITH_LIMITATIONS` | M5, resume, retry, M6 PASS        | Assisted native interaction required        | UDP relay PASS                              | PASS           | Refresh/restart `NOT_SUPPORTED`; background `NOT_TESTED` |
| Edge 152.0.4191.66, Windows 10 x64          | Real stable browser, automated      | `SUPPORTED_WITH_LIMITATIONS` | M5, resume, retry, M6 PASS        | Assisted native interaction required        | UDP relay PASS                              | PASS           | Refresh/restart `NOT_SUPPORTED`; background `NOT_TESTED` |
| Firefox 155.0.1, Windows 10 x64             | Real stable browser, WebDriver BiDi | `SUPPORTED_WITH_LIMITATIONS` | Direct M5, resume, retry, M6 PASS | No qualified streaming external destination | `NOT_SUPPORTED`: local `FS_ROUTE_EXHAUSTED` | `NOT_TESTED`   | `NOT_TESTED`                                             |
| Chrome macOS / Safari macOS / Firefox macOS | No real Mac host                    | `NOT_TESTED`                 | `NOT_TESTED`                      | `NOT_TESTED`                                | `NOT_TESTED`                                | `NOT_TESTED`   | `NOT_TESTED`; no V1 support claim                        |
| Chrome Android / Safari iOS/iPadOS          | No real device or device farm       | `NOT_TESTED`                 | `NOT_TESTED`                      | `NOT_TESTED`                                | `NOT_TESTED`                                | `NOT_TESTED`   | `NOT_TESTED`; no V1 support claim                        |

The machine-readable [M9 browser matrix](../benchmarks/results/2026-09-09/m9-browser-matrix.json) contains only schema-valid real-browser artifacts and explicit skipped records.

## Destination Strategy

| Browser         | File source                                | Folder source                              | File destination                                      | Folder destination                                | Limitation                                                  |
| --------------- | ------------------------------------------ | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Chrome Windows  | Automation fixture; native picker assisted | Structural fixture; native picker assisted | Bounded OPFS fixture; selected external file assisted | Bounded OPFS fixture; selected directory assisted | Real user-selected paths and permissions are unqualified    |
| Edge Windows    | Automation fixture; native picker assisted | Structural fixture; native picker assisted | Bounded OPFS fixture; selected external file assisted | Bounded OPFS fixture; selected directory assisted | Real user-selected paths and permissions are unqualified    |
| Firefox Windows | Automation fixture                         | Directory selection unavailable            | Bounded OPFS fixture only                             | Directory write unavailable                       | No safe production external streaming destination qualified |

OPFS is fixture and recovery-metadata infrastructure, never a giant-payload cache. FlickSend does not use whole-file Blobs, unbounded memory, or a giant OPFS fallback when an external selected incremental destination is unavailable.

## Lifecycle

Chrome and Edge lifecycle artifacts used headed real browsers. Direct transfer delivered with a verified root, but Playwright reported both candidate tabs `visible`; hidden-tab behavior is therefore `NOT_TESTED`. After a receiver-displayed verified committed block, refresh and persistent-profile restart each lost transfer identity, so both are `NOT_SUPPORTED` for the bounded fixture. No selected source/destination handle was involved, so this does not claim a result about real picker permissions.

Permission after picker, permission revocation, ordinary reconnect with selected handles, screen lock,
and sleep are `NOT TESTED - assisted native interaction required`. The available browser bridge can
open Chrome's native file chooser but cannot operate the native Windows chooser. Its only file
alternative programmatically injects files, so no native picker result was fabricated.

## WebRTC And Health

Chrome and Edge have actual direct, forced local coturn UDP relay, and direct-to-relay qualification. Passing resumes preserved transfer identity with zero duplicate payload and zero receiver-committed block retransmission. Firefox passed direct `DIRECT_SRFLX` M5/M6/resume/integrity qualification, but its forced local coturn relay safely terminated with `FS_ROUTE_EXHAUSTED`; direct-to-relay recovery was consequently not attempted. This is a local evidence limitation, not a global claim that Firefox cannot use TURN.

Chrome, Edge, and Firefox direct runs observed application payload, source read, sender buffer, receive queue, WebRTC byte counters, route, and RTT. Destination write and outgoing bitrate remain `UNAVAILABLE`, not zero. None of these compatibility artifacts is a physical performance claim.

## Deferred Windows Filesystem Risk

Use [M9 assisted qualification](M9-ASSISTED-QUALIFICATION.md) with actual Chrome or Edge picker interaction, then import its unmodified metadata-only record with `pnpm qualification:m9:assisted -- --input <artifact>`. The importer requires matching same-browser core evidence and can retain only `PASS` or `PARTIAL` evidence justified by the record.

The Windows-first engine qualification is accepted with this explicit product risk:
`M9 real external Windows filesystem/picker qualification: DEFERRED / ACCEPTED PRODUCT RISK`.
Fixtures, feature detection, and selected API availability do not satisfy a real filesystem claim;
Chrome and Edge therefore remain `SUPPORTED_WITH_LIMITATIONS`, never `FULL_SUPPORT`.

M10 same-host Chrome qualification used bounded Engine Lab fixtures and temporary qualification
storage only. It does not exercise a real Windows picker or promote this M9 risk to a pass.

## Future macOS And Mobile Qualification

Run `pnpm qualification:m9:macos` on a real Mac when that environment is available. Safari must be
tested in Safari on macOS; Playwright WebKit cannot populate that support tier. Real Android Chrome and
Safari on iOS/iPadOS require real devices or an authorized device farm. These targets are `NOT TESTED`
and `NOT YET QUALIFIED`, not unsupported, and do not block the Windows-first V1 M9 gate.
