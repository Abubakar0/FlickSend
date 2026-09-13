# M9 Implementation Report

## Status

```text
M9 WINDOWS-FIRST ENGINE QUALIFICATION: ACCEPTED
M9 REAL EXTERNAL WINDOWS FILESYSTEM/PICKER: DEFERRED / ACCEPTED PRODUCT RISK
```

Initial V1 compatibility scope is Windows-first desktop: Google Chrome stable and Microsoft Edge stable
on Windows are the primary targets. Mozilla Firefox stable on Windows is secondary and remains
`SUPPORTED_WITH_LIMITATIONS`. Chrome macOS, Safari macOS, Firefox macOS, Android Chrome, and
Safari on iOS/iPadOS are `NOT TESTED` and `NOT YET QUALIFIED`; FlickSend makes no V1 support claim
for them. Their qualification harnesses remain intact for future real-platform evidence.

The accepted Windows-first engine boundary does not include a real Chrome/Edge selected-file,
selected-folder, external file-destination, and external folder-destination workflow. That evidence
is explicitly deferred as an accepted product risk. This is not a filesystem pass: a fixture,
emulation, or OPFS payload storage cannot substitute for it.

## Tested Environments

| Target                      | Environment                                                                      | Evidence class                                 | Result                       |
| --------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| Chrome 152.0.7977.83        | Windows 10 `10.0.19045`, x64                                                     | Real stable browser, automated                 | `SUPPORTED_WITH_LIMITATIONS` |
| Edge 152.0.4191.66          | Windows 10 `10.0.19045`, x64                                                     | Real stable browser, automated                 | `SUPPORTED_WITH_LIMITATIONS` |
| Firefox 155.0.1             | Windows 10 `10.0.19045`, x64                                                     | Real stable browser, WebDriver BiDi automation | `SUPPORTED_WITH_LIMITATIONS` |
| Chrome/Safari/Firefox macOS | No real macOS host, authorized remote host, CI runner, or browser farm available | Not tested; no V1 support claim                | `NOT_TESTED`                 |
| Chrome Android / Safari iOS | No real device, ADB, or authorized device farm available                         | Not tested; no V1 support claim                | `NOT_TESTED`                 |

`pnpm qualification:m9:macos` was run on this Windows host. It deliberately skipped macOS targets; it did not launch WebKit or create synthetic Safari evidence.

## Support Matrix

| Browser/device    | Tier                         | File send               | File receive              | Folder send                     | Folder receive                  | Resume          | TURN                    | Route recovery       | Health                   |
| ----------------- | ---------------------------- | ----------------------- | ------------------------- | ------------------------------- | ------------------------------- | --------------- | ----------------------- | -------------------- | ------------------------ |
| Chrome Windows    | `SUPPORTED_WITH_LIMITATIONS` | Fixture PASS            | Bounded OPFS fixture PASS | Structural fixture PASS         | Bounded OPFS fixture PASS       | In-session PASS | UDP relay PASS          | Direct to relay PASS | Observed                 |
| Edge Windows      | `SUPPORTED_WITH_LIMITATIONS` | Fixture PASS            | Bounded OPFS fixture PASS | Structural fixture PASS         | Bounded OPFS fixture PASS       | In-session PASS | UDP relay PASS          | Direct to relay PASS | Observed                 |
| Firefox Windows   | `SUPPORTED_WITH_LIMITATIONS` | Automation fixture PASS | Bounded OPFS fixture only | Virtual structural fixture only | Virtual structural fixture only | In-session PASS | `NOT_SUPPORTED` locally | `NOT_TESTED`         | Observed on direct route |
| Chrome macOS      | `NOT_TESTED`                 | `NOT_TESTED`            | `NOT_TESTED`              | `NOT_TESTED`                    | `NOT_TESTED`                    | `NOT_TESTED`    | `NOT_TESTED`            | `NOT_TESTED`         | `NOT_TESTED`             |
| Safari macOS      | `NOT_TESTED`                 | `NOT_TESTED`            | `NOT_TESTED`              | `NOT_TESTED`                    | `NOT_TESTED`                    | `NOT_TESTED`    | `NOT_TESTED`            | `NOT_TESTED`         | `NOT_TESTED`             |
| Firefox macOS     | `NOT_TESTED`                 | `NOT_TESTED`            | `NOT_TESTED`              | `NOT_TESTED`                    | `NOT_TESTED`                    | `NOT_TESTED`    | `NOT_TESTED`            | `NOT_TESTED`         | `NOT_TESTED`             |
| Chrome Android    | `NOT_TESTED`                 | `NOT_TESTED`            | `NOT_TESTED`              | `NOT_TESTED`                    | `NOT_TESTED`                    | `NOT_TESTED`    | `NOT_TESTED`            | `NOT_TESTED`         | `NOT_TESTED`             |
| Safari iOS/iPadOS | `NOT_TESTED`                 | `NOT_TESTED`            | `NOT_TESTED`              | `NOT_TESTED`                    | `NOT_TESTED`                    | `NOT_TESTED`    | `NOT_TESTED`            | `NOT_TESTED`         | `NOT_TESTED`             |

Fixture success is not real user-selected filesystem evidence. No browser is `FULL_SUPPORT`.

## Filesystem And Lifecycle

| Browser         | Source file             | Source folder          | Destination file     | Destination folder     | Empty directories       | Resume permission |
| --------------- | ----------------------- | ---------------------- | -------------------- | ---------------------- | ----------------------- | ----------------- |
| Chrome Windows  | Automated input fixture | Assisted required      | Bounded OPFS fixture | Bounded OPFS fixture   | Structural fixture PASS | Assisted required |
| Edge Windows    | Automated input fixture | Assisted required      | Bounded OPFS fixture | Bounded OPFS fixture   | Structural fixture PASS | Assisted required |
| Firefox Windows | Automated input fixture | Capability unavailable | Bounded OPFS fixture | Capability unavailable | `NOT_TESTED`            | `NOT_TESTED`      |
| macOS/mobile    | `NOT_TESTED`            | `NOT_TESTED`           | `NOT_TESTED`         | `NOT_TESTED`           | `NOT_TESTED`            | `NOT_TESTED`      |

| Browser         | Background tab | Refresh         | Browser restart | Permission loss | Screen lock/sleep |
| --------------- | -------------- | --------------- | --------------- | --------------- | ----------------- |
| Chrome Windows  | `NOT_TESTED`   | `NOT_SUPPORTED` | `NOT_SUPPORTED` | `NOT_TESTED`    | `NOT_TESTED`      |
| Edge Windows    | `NOT_TESTED`   | `NOT_SUPPORTED` | `NOT_SUPPORTED` | `NOT_TESTED`    | `NOT_TESTED`      |
| Firefox Windows | `NOT_TESTED`   | `NOT_TESTED`    | `NOT_TESTED`    | `NOT_TESTED`    | `NOT_TESTED`      |

The Chrome and Edge lifecycle runs used headed real browsers. Each transferred correctly while automation reported both candidate tabs `visible`, so a real hidden-tab state was not observed and the background result is `NOT_TESTED`. Each refresh/restart run began after the receiver displayed one of two verified committed blocks, then lost transfer identity after page reload or persistent-profile relaunch. With no selected external handle in the fixture, the accurate result is `NOT_SUPPORTED`, not an external-destination claim.

Native picker, selected file/directory destination, picker permission, permission revocation, ordinary
reconnect with selected handles, screen lock, and sleep are still `NOT TESTED - assisted native
interaction required`. The available browser bridge can open Chrome's native file chooser but cannot
operate the native Windows chooser; its only file alternative programmatically injects files and is
therefore not accepted as picker evidence. No picker interaction was fabricated. The complete human
procedure and metadata-only importer remain in [M9 assisted qualification](M9-ASSISTED-QUALIFICATION.md).

## WebRTC, Integrity, And Continuity

| Browser         | Direct               | Forced TURN                           | Direct to TURN | Stable ID              | Duplicate bytes | Committed blocks resent | Root / delivered      |
| --------------- | -------------------- | ------------------------------------- | -------------- | ---------------------- | --------------- | ----------------------- | --------------------- |
| Chrome Windows  | PASS                 | PASS, local coturn UDP relay          | PASS           | PASS                   | 0               | 0                       | PASS / PASS           |
| Edge Windows    | PASS                 | PASS, local coturn UDP relay          | PASS           | PASS                   | 0               | 0                       | PASS / PASS           |
| Firefox Windows | PASS, `DIRECT_SRFLX` | `NOT_SUPPORTED`, `FS_ROUTE_EXHAUSTED` | `NOT_TESTED`   | PASS for direct resume | 0               | 0                       | PASS / PASS on direct |

Firefox stable was automated through its standard WebDriver BiDi endpoint, not Playwright's patched Firefox protocol. Its direct M5 8 MiB transfer, M5 corruption retry, 16 MiB in-session resume, and M6 structural fixture all reached `DELIVERED` with verified roots. Its forced local coturn route exhausted safely with `FS_ROUTE_EXHAUSTED`; that is a local qualification limitation, not a claim that Firefox never supports TURN elsewhere. Direct-to-relay recovery was not eligible without a working relay route.

For all passing resume evidence, the stable transfer ID was retained with `safeBytesBeforeDisconnect: 8,388,608`, `remainingBytesAtResume: 8,388,608`, `resumedPayloadBytes: 8,388,608`, `duplicateRetransmittedBytes: 0`, `committedBlocksRetransmitted: 0`, and `ambiguousInflightBytesRetransmitted: 0`. Verified receiver-committed progress remains preserved; post-recovery payload is not generically called retransmission.

The local coturn evidence is UDP-only. It does not qualify TURN/TCP, production TURN deployment, or TURN-to-direct reacquisition.

## Transfer Health

Chrome, Edge, and Firefox direct runs observed application payload, source read, sender buffer, receive queue, WebRTC byte counters, route, and RTT. Destination write and available outgoing bitrate remain `UNAVAILABLE`, never zero. Firefox's direct route was `DIRECT / DIRECT_SRFLX / udp`; its health data is functional diagnostics, not a disk, network, or throughput claim.

## Evidence

- [M9 browser matrix](../benchmarks/results/2026-09-09/m9-browser-matrix.json)
- [Chrome lifecycle](../benchmarks/results/2026-09-09/m9-chrome-windows-lifecycle.json)
- [Edge lifecycle](../benchmarks/results/2026-09-09/m9-edge-windows-lifecycle.json)
- [Firefox core](../benchmarks/results/2026-09-09/m9-firefox-windows.json)
- [Firefox TURN](../benchmarks/results/2026-09-09/m9-firefox-turn.json)
- [Firefox route recovery](../benchmarks/results/2026-09-09/m9-firefox-route-recovery.json)

## Verification

| Command                       | Actual result                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`              | PASS: 22 Turbo tasks                                                                                |
| `pnpm lint`                   | PASS: 12 Turbo tasks                                                                                |
| `pnpm test`                   | PASS: 121 tests across 21 Turbo tasks                                                               |
| `pnpm test:e2e`               | PASS: 16 passed and 16 explicitly gated/skipped tests                                               |
| `pnpm build`                  | PASS: 12 Turbo tasks; Engine Lab production build succeeded                                         |
| `pnpm format:check`           | PASS                                                                                                |
| `pnpm qualification:m9`       | PASS: retained version-matched Chrome, Edge, and Firefox real-browser evidence and the dated matrix |
| `pnpm qualification:m9:macos` | PASS: correct macOS-host guard; macOS targets skipped, not simulated                                |

`pnpm qualification:m9:turn` was not replayed during this closeout because no product WebRTC or route-selection behavior changed. The accepted Chrome and Edge UDP relay/direct-to-relay artifacts remain dated evidence; Firefox's new relay result is retained by `pnpm qualification:m9`.

```text
M9 REPOSITORY VERIFICATION: PASS
```

## Deferred Windows Filesystem Risk

Real external filesystem/picker and selected-handle permission qualification for Windows Chrome/Edge
is `DEFERRED / ACCEPTED PRODUCT RISK`. It remains required before making a real external-filesystem
support claim.

## Deferred

The following work is outside the accepted Windows-first M9 engine boundary. The explicit Windows
filesystem/picker risk remains deferred and must not be interpreted as a filesystem support claim.

- macOS compatibility qualification: DEFERRED — real hardware required
- mobile compatibility qualification: DEFERRED — real devices required
- M3 physical performance qualification: DEFERRED
- M4 10 GiB long-run qualification: DEFERRED
- M10 physical performance qualification: IN PROGRESS / INCOMPLETE
- Production TURN deployment: NOT STARTED
- Application-layer payload encryption: NOT STARTED
- Offline delivery: NOT STARTED
- Mesh: NOT STARTED
- Turbo: NOT STARTED

M10 has started with a local-only preflight. It has not produced physical throughput evidence.
