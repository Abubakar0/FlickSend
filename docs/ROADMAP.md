# Roadmap

## P1 Status: V1 Product Definition Freeze Complete

P1 freezes the V1 customer, job, positioning, Windows-first platform policy, live-peer transfer model,
guest boundary, People scope, product lifecycle, verified-completion contract, claims policy, and
deferred risks. It creates no product UI, account/authentication implementation, database, billing,
production TURN, or other P2+ runtime work. The canonical contract is
[PRODUCT-DEFINITION-V1.md](PRODUCT-DEFINITION-V1.md).

## M10 Status: Available-Hardware Qualification Complete

M3 implements tunable bounded read-ahead, DataChannel watermarks, receiver write flow control,
throttled engine metrics, pause/resume, and benchmark export for the single-file pipeline. Physical
throughput, memory, long-duration, worker, and channel-count qualification has not been completed.

M6 delivers FSTP v5 StreamPack folders: safe metadata-only enumeration, canonical path and manifest
validation, virtual range mapping, 8 MiB SHA-256 blocks across file boundaries, bounded destination
writers, receiver-authoritative verified recovery, and browser/WebRTC qualification. M3 physical
qualification remains deferred.

M7 has a direct-first route coordinator, relay-only qualification policy, coturn REST credential
service, pinned local coturn compose service, and real-browser qualification. The September 8, 2026
Chromium/coturn run passed direct, forced relay, M5/M6 recovery, and explicit credential/no-route
failure scenarios with raw evidence retained under `benchmarks/results/2026-09-08`.

M8 adds framework-independent Transfer Health and SpeedProof diagnostics. It uses bounded safe
measurement sampling, conservative reasoned bottleneck inference, route segmentation, health
states, pause/recovery suppression, and Engine Lab export without altering FSTP transfer
correctness. Local Chromium browser, real-engine paced M5, and direct-to-relay health-sequence
evidence are retained; physical performance and broad compatibility claims remain deferred.

M9 adds a typed browser-capability layer, Engine Lab limitation messaging, a host-aware qualification
runner, a real-picker assisted evidence export, and a machine-readable compatibility matrix. Real
Chrome 152.0.7977.83 and Edge 152.0.4191.66 on Windows passed direct M5, verified resume, corruption
retry, structural StreamPack, forced local TURN, direct-to-TURN recovery, and headed lifecycle
observation. Their bounded-fixture refresh/restart result is `NOT_SUPPORTED`; automation did not
observe a true hidden tab. Real Firefox 155.0.1 passed direct core qualification through WebDriver BiDi
but forced local relay ended safely with `FS_ROUTE_EXHAUSTED`. The approved initial V1 target is
Windows-first desktop: Chrome/Edge on Windows are primary and Firefox on Windows is secondary with
limitations. The Windows-first engine qualification is accepted with real Windows Chrome/Edge
filesystem/picker evidence explicitly `DEFERRED / ACCEPTED PRODUCT RISK`; it is not a filesystem
support claim. macOS Chrome/Safari/Firefox and Android/iOS/iPadOS are `NOT TESTED` and `NOT YET
QUALIFIED`, have no V1 support claim, and remain future real-platform qualification work.

M10 adds a framework-independent physical-evidence validator, a create-only privacy-safe benchmark
runner, two-machine operator instructions, and a same-host Path B closeout. The September 10 result
adds real 10 GiB disk observations, 1 GiB and 10 GiB same-host browser delivery, 10 GiB resume,
Health on/off, CPU/RAM samples, and 10,000-file StreamPack evidence. It closes the M0-M10 core
roadmap for productization while retaining two-machine physical network evidence as deferred.

## Explicitly Deferred

- M10 two-machine physical network qualification: `DEFERRED / ACCEPTED PRODUCT RISK`.
- M10 physical network utilization and physical TURN throughput: `DEFERRED`.
- Production SaaS: accounts, People, invitations, API/database, billing, final UI, and operations.
- Later: WebTransport relay, offline delivery, Mesh, and native Turbo.

M9 Windows-first engine qualification is accepted with its explicit picker risk. M10 available-
hardware qualification is complete. P1 is documentation-only. P2 brand/domain/legal research is complete
with the decision `CONTINUE_PENDING_COUNSEL`: FlickSend may remain an internal working brand, but no public
launch, domain acquisition, or trademark claim may proceed without counsel review. P3 is complete as a
presentation-only, fixture-validated design foundation. P4 Core Send UX, P5 Receive UX, and P6 People & Pairing
are complete and frozen. P7 Transfers and P8 Recovery UX are complete and frozen. P9 Accessibility & UX QA is
complete and frozen as an audit/correction phase only. P10 Authentication & Accounts is complete and frozen after
live Clerk development qualification. P11 Production Database & Persistence is complete and frozen after local
PostgreSQL qualification. P12 Production Invitations & Signaling Infrastructure is complete and frozen after
PostgreSQL invitation and temporary Cloudflare Worker/Durable Object qualification. P13 and later product phases
remain not authorized until external review accepts P12.

P11 adds PostgreSQL/Prisma durable account, People, and metadata-only history repositories without changing engine
correctness. P12 adds digest-only authenticated People invitations and a bounded Cloudflare Worker/Durable Object
signaling control plane without changing FSTP correctness, routing, integrity, payload transport, retention,
deletion, analytics, billing, or any P13+ product scope.
