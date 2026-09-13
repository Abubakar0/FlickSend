# P4 Core Send UX Implementation Report

## Status

```text
P4 CORE SEND UX: COMPLETE
P4 FINAL VERIFICATION: PASS
P4 AFFECTED M6 QUALIFICATION: PASS
SENDER EXPERIENCE: FROZEN
```

## Sender Journey And Architecture

The production-facing sender route is `/send`. It composes frozen P3 presentation components with the explicit
application-layer `SendSessionController`. The controller prepares sources, coordinates a current development
session, subscribes to authoritative engine snapshots, maps product errors, cancels safely, and rejects stale
source/session work. React does not implement FSTP, recovery, integrity, StreamPack, route selection, or delivery
correctness. ADR 041 records this boundary.

Recipients are synthetic fixtures through a small provider contract. The development receiver harness accepts to
bounded synthetic destinations for browser qualification only; it is not P5 Receive UX or production authorization.

## Source, Review, And Active Transfer

Single files use the existing M5 path. Multiple files and folders use existing bounded StreamPack sources; P4
does not aggregate source payload, create a zip, or serialize browser handles. Preparation renders a truthful
indeterminate state until real enumeration progress is available. Review has one primary Send action and allows
pre-transfer source/recipient changes that invalidate stale session work.

Active transfer presentation uses `VerifiedProgress`, `TransferHealth`, `StatusBadge`, and safe route labels from
prepared engine snapshots. Verified progress is receiver-persisted committed progress. ETA is shown only with high
health confidence. Pause is intentionally not exposed because a safe unified StreamPack pause contract is absent.

## Recovery, Completion, Errors, And Cancellation

P4 maps recoverable engine interruption to `RECONNECTING`, retaining transfer identity and verified progress. A
real browser test proves a controlled reconnect resumes the same folder transfer with zero duplicate or committed
block retransmission. The regression also fixed a stale asynchronous source-read race in M6: an obsolete transport
epoch can no longer emit a block digest after a replacement starts.

`COMPLETED` maps only from engine `DELIVERED` for the active transfer identity. Integrity retry exhaustion renders
the terminal integrity error and never completion. Cancel is a confirmed active-transfer action and maps to
`CANCELED`, not `FAILED`.

## Accessibility, Responsive Behavior, Security, And Privacy

The route uses semantic headings, named controls, visible P3 focus treatment, a polite status region, terminal
focus, keyboard recipient/source actions, and a keyboard-operable confirmation dialog. Responsive and visual
review evidence is recorded with the P4 browser suite at desktop and narrow widths.

P4 exposes no payload, full local path, session secret, candidate, SDP, TURN credential, or transport trace in
ordinary product UI. It adds no product persistence for payload or browser source handles. Normal payload remains
outside the FlickSend application API.

## Real Engine Evidence

| Evidence                                                                | Result |
| ----------------------------------------------------------------------- | ------ |
| Single file through M5 browser/WebRTC engine and receiver SHA-256 match | `PASS` |
| Multiple selected files through bounded StreamPack                      | `PASS` |
| Structural folder through StreamPack and exact receiver tree            | `PASS` |
| Controlled M4/M6 reconnect with visible verified progress               | `PASS` |
| Integrity retry exhaustion maps to terminal product error               | `PASS` |
| M6 delayed-read recovery regression unit coverage                       | `PASS` |
| Bounded fixture destination revalidates committed block digests         | `PASS` |

## Affected Engine Qualification

P4 corrected an M6 runtime race: a source read begun on an obsolete transport epoch could complete after
replacement and emit a stale StreamPack block digest. Because this changes retained M6 runtime behavior, the
canonical M6 closeout command was rerun on 2026-09-11. There is no separate `qualification:m6` script; the
retained M6 closeout record defines the full `pnpm test:e2e` suite as its canonical command.

| Record                 | Actual result                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command                | `pnpm test:e2e`                                                                                                                                                                                                            |
| Environment            | Local Windows x64 host; Node `24.19.0`; Playwright Chromium; two isolated browser contexts; local Engine Lab and local Wrangler signaling                                                                                  |
| Executed M6 cases      | 8: structural multi-file folder, 10,000-file bounded-OPFS folder, mixed hierarchy, corrupted-block retry, single interruption resume, three-interruption resume, source mutation rejection, destination mutation rejection |
| Passed M6 cases        | 8                                                                                                                                                                                                                          |
| Skipped/gated M6 cases | 0                                                                                                                                                                                                                          |
| Failed M6 cases        | 0                                                                                                                                                                                                                          |
| Final result           | `PASS`                                                                                                                                                                                                                     |

The successful recovery cases preserved transfer identity, verified final manifest roots and reconstructed trees,
and recorded zero duplicate payload bytes and zero retransmitted receiver-committed blocks. The two mutation
cases passed by explicitly stopping with `FS_STREAMPACK_SOURCE_CHANGED` and
`FS_STREAMPACK_DESTINATION_CHANGED`, respectively; neither reached `DELIVERED`.

This rerun is retained M6 functional correctness evidence only. It does not add physical-network, external-picker,
or cross-platform qualification evidence.

## Acceptance Matrix

| Requirement                                                       | Result |
| ----------------------------------------------------------------- | ------ |
| Send route and P3 reuse                                           | `PASS` |
| Explicit product send state machine                               | `PASS` |
| Recipient selector and fixture boundary                           | `PASS` |
| Single-file, multi-file, and folder source selection              | `PASS` |
| StreamPack preparation and review                                 | `PASS` |
| Waiting, connecting, real progress, verified progress, and health | `PASS` |
| Recovery and authoritative completion                             | `PASS` |
| Cancellation and product error taxonomy                           | `PASS` |
| Stale recipient/source and double-start protection                | `PASS` |
| Keyboard accessibility and responsive sender layout               | `PASS` |
| Privacy/security boundary                                         | `PASS` |
| No P5+ scope creep                                                | `PASS` |
| Final repository verification                                     | `PASS` |

## Repository Verification

| Command             | Actual Result                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`    | `PASS` -- 25/25 Turbo tasks                                                                                                    |
| `pnpm lint`         | `PASS` -- 14/14 Turbo tasks                                                                                                    |
| `pnpm test`         | `PASS` -- 25/25 Turbo tasks; 153 unit tests                                                                                    |
| `pnpm test:e2e`     | `PASS` -- 24 executed/passed; 18 skipped; 0 failed; 42 configured. All 7 P4 tests executed and passed; no P4 test was skipped. |
| `pnpm build`        | `PASS` -- 14/14 Turbo tasks; optimized `/send` build completed                                                                 |
| `pnpm format:check` | `PASS` -- repository formatting check completed                                                                                |

## Known Limitations And Deferred Work

- M9 real external Windows picker evidence remains `DEFERRED / ACCEPTED PRODUCT RISK`.
- P5 Receive UX: `NOT STARTED`. Recipients are fixture/provider-backed; production recipient authorization is `DEFERRED`.
- History is not persistent until P7. P8 owns broader recovery diagnostics and polish.
- P9 accessibility audit, P10 production authentication, production database/account work, production TURN (`DEFERRED`),
  offline delivery, Mesh, Turbo, native application work, marketing, and SEO are not part of P4.

## Next Phase

After P4 review and acceptance only:

```text
P5 -- RECEIVE UX
```
