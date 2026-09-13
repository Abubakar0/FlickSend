# P8 Recovery UX Implementation Report

## Status

```text
P8 RECOVERY UX: COMPLETE
P8 FINAL VERIFICATION: PASS
RECOVERY EXPERIENCE: FROZEN
```

## Delivered Scope

P8 adds deterministic recovery presentation to the existing P4 sender, P5 receiver, and P7 transfer detail
surfaces. It covers automatic reconnect, a one-time restored acknowledgement, actionable local destination issues,
terminal recovery outcomes, integrity/finalization/service language, explicit cancellation, and safe new-transfer
actions.

The presentation layer is `apps/engine-lab/app/recovery/recovery-presentation.ts` and
`apps/engine-lab/app/recovery/recovery-notice.tsx`. It maps already-authoritative prepared workflow state and
product error view models; it has no transfer-correctness authority. ADR 045 records the boundary.

## Correctness Preservation

P8 changes no FSTP, block/recovery map, integrity verifier, StreamPack behavior, route selection, TURN behavior,
signaling protocol, destination writer, or engine delivery rule. Completion remains gated exclusively by engine
`DELIVERED` for the active transfer identity. Verified committed blocks remain an engine concern and are not resent
by P8.

The recovery action regression revealed and fixed one P4 workflow issue: a sender reset after a terminal failure
discarded the already-known browser capability decision and disabled the next send. Reset now retains that
browser-level decision while clearing the old session/source/identity. A unit test and a real browser test confirm
the next attempt gets a distinct identity and late old-attempt updates cannot affect it.

## Browser Qualification

`tests/e2e/p8-recovery.spec.ts` passed all 12 Chromium scenarios in 1.9 minutes:

1. Real sender interruption, verified-safe copy, restoration, delivery, one P7 record, and safe recovery detail.
2. Real recipient interruption, prepared-destination continuity, restoration, and completion.
3. Recovery exhaustion mapped to terminal new-send action instead of an endless reconnect state.
4. Source mutation mapped to source reselection with no false preservation claim.
5. Destination mutation mapped to a non-completing terminal state without overwrite.
6. Recipient permission loss mapped to destination selection.
7. Storage exhaustion mapped to destination selection.
8. Real one-time integrity retry uses neutral checking language before delivery.
9. Integrity exhaustion stays terminal and never marks completion.
10. Destination finalization and service failures use safe product copy with no raw engine detail; responsive widths pass.
11. Explicit cancellation remains distinct from recovery failure.
12. A terminal recovery failure followed by a new send creates a new identity and reaches delivery.

The responsive evidence covers 1440, 1280, 1024, 768, and 390 px viewports. No P8-critical browser scenario is
skipped.

## Peer Availability Evidence

P8 does not reinterpret normal peer waiting as a recoverable failure. The retained P4 browser case
`P4 sender sends a selected file through the actual engine and completes only after delivery` establishes a valid
session, renders `Waiting for Alex Morgan`, announces `Waiting for Alex Morgan.` through the polite live region,
and continues to verified delivery when the recipient joins. This pre-transfer waiting state has no active transfer
identity, so peer absence cannot create a replacement identity.

The P5 reducer case `waits with an authorized prepared destination until the sender returns` proves the reciprocal
post-authorization state. It retains `fs_tr_active` and the prepared destination, has no error, announces
`Waiting for Alex Morgan.`, and moves through `READY_TO_RECEIVE` to `RECEIVING` when the sender returns.
`ReceiveWorkspace` renders this state in an `aria-live="polite"` status region. The normal P5 browser cases prove
the surrounding real P4-to-P5 flow and DELIVERED-only completion. No artificial browser-delay mechanism was added
for P8 merely to hold the immediate signaling transition on screen.

Neither direction shows a terminal error, false `COMPLETED`, replacement identity, or verified-progress safety
claim while peer waiting is legitimate.

## Retained Product Regression Evidence

| Surface        | Configured / executed | Passed | Skipped | Failed | Evidence                                                                                                                                                                                                                                       |
| -------------- | --------------------: | -----: | ------: | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4 Send        |                 7 / 7 |      7 |       0 |      0 | Normal delivery, recipient/source/review, recovery, DELIVERED-only completion, terminal failure, keyboard, and responsive layout. P8 browser and P4 reducer tests cover cancel and stale-attempt isolation.                                    |
| P5 Receive     |               10 / 10 |     10 |       0 |      0 | Normal single/multiple/folder receive, recovery, destination mutation, finalization, integrity, generic invalid session, keyboard/responsive review, and cancellation. P5 reducer tests cover waiting and stale session/destination isolation. |
| P6 People      |                 6 / 6 |      6 |       0 |      0 | Pairing, connected-recipient eligibility, blocked exclusion, and active-transfer isolation.                                                                                                                                                    |
| P7 Transfers   |                 7 / 7 |      7 |       0 |      0 | One record through recovery, completion, failed/canceled outcomes, privacy-safe SpeedProof detail, and Send again eligibility.                                                                                                                 |
| P8 Recovery UX |               12 / 12 |     12 |       0 |      0 | Reconnect, exhaustion, source/destination faults, integrity, finalization/service, cancel, new identity, P7 detail, and responsive behavior.                                                                                                   |

The exact regression counts above are from the full browser run recorded in this report. No P8 test is gated or
skipped.

## P8 Acceptance Matrix

| Requirement                              | Result | Evidence                                                      |
| ---------------------------------------- | ------ | ------------------------------------------------------------- |
| AGENTS P8 boundary updated               | PASS   | `AGENTS.md` freezes P8 and keeps P9+ unauthorized.            |
| Recovery presentation model              | PASS   | Deterministic `RecoveryViewModel` and `RecoveryNotice`.       |
| Recovery reason mapping                  | PASS   | P8 unit mapping tests and action matrix.                      |
| Automatic vs action-required distinction | PASS   | Prepared state/error mapping and P8 browser fault cases.      |
| Verified-progress safe wording           | PASS   | P8 reconnect cases and negative mutation checks.              |
| Sender reconnect UX                      | PASS   | P8 sender recovery case.                                      |
| Recipient reconnect UX                   | PASS   | P8 recipient recovery case.                                   |
| Connection-restored UX                   | PASS   | P8 sender and recipient recovery cases.                       |
| Peer waiting states                      | PASS   | P4 browser wait and P5 prepared-destination reducer case.     |
| Recovery exhaustion UX                   | PASS   | P8 route-exhaustion case.                                     |
| Source-changed UX                        | PASS   | P8 source-mutation case.                                      |
| Destination-changed UX                   | PASS   | P8 destination-mutation case.                                 |
| Permission-lost UX                       | PASS   | P8 permission-fault case.                                     |
| Destination-unavailable UX               | PASS   | P8 reason-map unit coverage and P5 destination mapping.       |
| Storage-full UX                          | PASS   | P8 storage-fault case.                                        |
| Integrity-retry UX                       | PASS   | P8 real one-time retry case.                                  |
| Integrity-exhaustion UX                  | PASS   | P8 terminal-integrity case.                                   |
| Destination-finalization UX              | PASS   | P8 finalization-failure case.                                 |
| Service-unavailable UX                   | PASS   | P8 service-failure case.                                      |
| Browser lifecycle limitations truthful   | PASS   | P8 preserves M9 `NOT_SUPPORTED` refresh/restart evidence.     |
| Cancel distinct from failure             | PASS   | P8 cancellation case and P4/P5 reducer coverage.              |
| Retry starts new transfer where required | PASS   | P8 post-exhaustion new-identity case.                         |
| Stale old-attempt protection             | PASS   | P4/P5 reducer tests and P8 new-identity case.                 |
| P7 recovery-history integration          | PASS   | P8 sender recovery and P7 recovery-record cases.              |
| SpeedProof recovery summary              | PASS   | P8 safe P7 detail and P7 recovery-record cases.               |
| Safe diagnostics                         | PASS   | P8 safe-detail negative assertions and rendered allowlist.    |
| Raw internals hidden                     | PASS   | P8 negative assertions and error-taxonomy boundary.           |
| Recovery action matrix complete          | PASS   | [P8-RECOVERY-ACTION-MATRIX.md](P8-RECOVERY-ACTION-MATRIX.md). |
| Recovery copy catalog complete           | PASS   | [P8-RECOVERY-COPY.md](P8-RECOVERY-COPY.md).                   |
| Accessibility                            | PASS   | Live-region assertions and semantic recovery notices.         |
| Responsive layout                        | PASS   | P8 1440 through 390 px browser checks.                        |
| Security/privacy review                  | PASS   | Safe-detail allowlist and documentation review.               |
| P4 regression                            | PASS   | 7 of 7 retained P4 browser cases passed.                      |
| P5 regression                            | PASS   | 10 of 10 retained P5 browser cases passed.                    |
| P6 regression                            | PASS   | 6 of 6 retained P6 browser cases passed.                      |
| P7 regression                            | PASS   | 7 of 7 retained P7 browser cases passed.                      |
| No P9+ scope creep                       | PASS   | P8-only tests and documentation; no P9 implementation.        |
| Repository verification                  | PASS   | Full command results below.                                   |

## Engine Qualification Boundary

```text
M4-M10 DEDICATED QUALIFICATION: NOT RERUN — NO ENGINE CORRECTNESS CHANGE
```

P8 consumes retained M4-M10 behavior and adds product presentation only. The P4 reset fix preserves a detected
browser capability decision across attempts; it does not affect FSTP, recovery, integrity, StreamPack, routing,
TURN, performance, or compatibility implementation.

## Privacy, Accessibility, And Limits

The rendered recovery details are restricted to route category, aggregate reconnect/integrity counts, and prepared
Transfer Health facts. They omit paths, filenames, manifests, hashes, payload, transfer/session IDs, network
addresses, candidates, credentials, raw codes, and stack traces. P8 adds no analytics, telemetry, support upload,
authentication, persistence, or service infrastructure.

Automatic/recovered notices have status semantics; actionable/terminal notices have alert semantics. Recovery
actions use explicit labels. P8 makes no claim for refresh, restart, backgrounding, sleep, or offline continuity.
The M9 refresh/restart limitation remains `NOT_SUPPORTED` for its bounded fixture evidence.

## Repository Verification

| Command             | Actual result                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`    | PASS: 25 Turborepo tasks successful.                                                                                              |
| `pnpm lint`         | PASS: 14 Turborepo tasks successful.                                                                                              |
| `pnpm test`         | PASS: 25 Turborepo tasks successful; Engine Lab: 53 tests in 8 files; engine-core: 48 tests in 10 files.                          |
| `pnpm test:e2e`     | PASS: 59 passed, 18 environment-gated skipped, 77 configured, 0 failed, in 10.6 minutes. All 12 P8 scenarios executed and passed. |
| `pnpm build`        | PASS: 14 Turborepo tasks successful, including the production Next.js Engine Lab build and signaling dry-run bundle.              |
| `pnpm format:check` | PASS: all matched files use Prettier style.                                                                                       |

The 18 skipped Playwright cases are retained environment-gated large-payload, physical qualification, coturn,
and lifecycle evidence tests. They are outside the P8 presentation qualification scope; no P4-P8 regression or
P8-critical test is skipped.

## Deferred

- Browser refresh resume: `NOT SUPPORTED` by current bounded evidence.
- Browser restart resume: `NOT SUPPORTED` by current bounded evidence.
- Background/sleep: `NOT QUALIFIED`; offline continuity: `NOT V1`.
- Manual route selection and manual reconnect control: `NOT IMPLEMENTED`.
- M9 external Windows picker: `DEFERRED / ACCEPTED PRODUCT RISK`.
- Deep accessibility and UX audit: P9; production auth: P10; production database: P11; production
  service/signaling: P12+; production observability: P18; analytics: P28.
- Production TURN: `DEFERRED`. Billing, marketing, SEO, Mesh, Turbo, native work, teams, and enterprise
  capabilities remain unauthorized.

The deferred items are outside P8's acceptance boundary and do not alter its presentation-only scope.

## Closeout

```text
P8 RECOVERY UX: COMPLETE
P8 FINAL VERIFICATION: PASS
RECOVERY EXPERIENCE: FROZEN

NEXT PHASE:
P9 — ACCESSIBILITY & UX QA
```

P9 remains not authorized in this task. No P9 implementation was started.
