# P13/P14 Integration Report

P13 and P14 share only a narrow server-to-server relay eligibility boundary. P13 remains the
cryptographic signaling authority; P14 Railway verifies the capability locally, attaches a
domain-separated proof, and receives only a safe eligibility category. P14 then returns a prepared
ephemeral ICE DTO to the browser. No payload, transfer identity, account subject, coturn secret,
session diagnostic, candidate, SDP, or route-control primitive crosses into product state.

The P14 ICE-provider interface accepts capability-authorized signaling sessions without a legacy
six-digit session code. The legacy HTTP credential provider still requires its session code; this
compatibility correction preserves the M7 fixture path and avoids placing capability or Railway logic
inside `engine-core`.

## Evidence Status

- P13 repository implementation: PASS. `pnpm qualification:p13` passes its six configuration tests,
  eighteen signaling tests, and staging Worker dry-run.
- P14 repository implementation: PASS. `pnpm qualification:p14` passes coturn artifact checks,
  Engine Lab issuer/route/browser-adapter tests, and local Compose validation.
- Combined repository qualification: PASS. `pnpm qualification:p13-p14` reports repository `PASS` with
  both phase-specific external blockers.
- Retained P12 qualification: PASS. It resets only its guarded loopback PostgreSQL fixture, runs one
  setup test, ten persistence/invitation cases, and twelve local Worker/Durable Object signaling cases.
- Repository verification: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` PASS. The clean
  browser suite reports 71 passed, 18 skipped, 0 failed, and 89 configured.
- Repository formatting: `pnpm format:check` still fails on a pre-existing global baseline of 372
  files. Touched P13/P14 files were separately formatted and checked; the baseline is not hidden or
  relabeled as a phase qualification result.
- No database migration was added.
- FSTP, integrity, StreamPack, transfer identity, payload transport, and M4-M10 qualification logic
  were not redesigned or rerun by this infrastructure work.

## External Gates

P13 remains **BLOCKED — PERSISTENT CLOUDFLARE STAGING QUALIFICATION NOT EXECUTED**. P14 remains
**BLOCKED — PUBLIC TURN INFRASTRUCTURE QUALIFICATION NOT EXECUTED**. Local Docker and Worker dry-runs
do not substitute for either gate. No deployment, public relay, TLS/TURNS, physical-throughput, or
rollback claim is made here.

P15+ scope was not started.
