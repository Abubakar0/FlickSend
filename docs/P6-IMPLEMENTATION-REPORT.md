# P6 People & Pairing Implementation Report

## Status

```text
P6 PEOPLE & PAIRING: COMPLETE
P6 FINAL VERIFICATION: PASS
PEOPLE EXPERIENCE: FROZEN
```

## People Mental Model

P6 implements the small repeated-sending relationship: "I know this person on FlickSend, so I can send to them
again." It does not implement a social graph, address book, chat, workspace, global directory, transfer history,
or production account system.

## Architecture

`PeopleController` owns the authoritative application reducer and stale-operation revisions. UI reads its prepared
snapshot through `PeopleProvider`. `PeopleRepository` is the persistence boundary. The current repository adapter
uses the server-local `DevelopmentPeopleStore` only for Engine Lab integration qualification.

`/people` and `/send` receive People data through this boundary. `@flicksend/ui` remains presentation-only. No
engine package, FSTP code, payload path, transfer identity, session authorization, StreamPack, integrity, recovery,
or route-selection code changed.

## Identity And Repository Boundary

Relationships use opaque `PersonIdentity.id` values. Display names, initials, and presence are not relationship
keys. The repository stores synthetic identities and minimal relationship metadata only.

```text
P6 DEVELOPMENT PEOPLE STORE
NOT PRODUCTION ACCOUNT/DATABASE PERSISTENCE

P6 DEVELOPMENT PAIRING MECHANISM
NOT PRODUCTION INVITATION SECURITY
```

The process-local store is disabled in production runtime. It provides short-lived, single-use opaque development
codes for deterministic browser qualification. Codes are not written to People lists, logs, analytics, transfer
state, session state, or persistent storage.

## Relationship State Machine

P6 has one relationship record per unordered opaque-ID pair. Its user-facing states are `UNCONNECTED`,
`INVITED_OUTGOING`, `INVITED_INCOMING`, `CONNECTED`, and `BLOCKED`. The detailed transition contract is in
[P6-RELATIONSHIP-STATE-MACHINE.md](P6-RELATIONSHIP-STATE-MACHINE.md).

## Invite, Accept, And Decline

Creating a code is idempotent while an active code exists. Redeeming it creates one directed pending invitation.
Accept transitions one incoming relationship to `CONNECTED`, and repeated Accept remains idempotent. Decline
removes the pending relationship without blocking it. Invalid or expired codes use generic
`FS-PRODUCT-PEOPLE-INVITE-INVALID` copy and do not disclose People metadata.

## Duplicate And Cross-Invite Behavior

The store never creates duplicate relationship records. Redeeming the same-direction code preserves the existing
pending relationship. When two people create and redeem inverse codes, the repository recognizes mutual intent and
converges to one `CONNECTED` record. A self redemption is rejected at the relationship layer.

## Remove, Block, And Unblock

Remove changes `CONNECTED` to `UNCONNECTED` after confirmation. Block is distinct: it ends or prevents the
relationship and prevents future ordinary pairing, acceptance, and Send selection. Unblock returns to
`UNCONNECTED`; it does not reconnect automatically. Remove and Block use P3 focus-managed confirmation dialogs.

## Presence

Presence is fixture-backed and advisory. `available`, `unavailable`, and `unknown` remain distinct. Unknown
presence is not coerced to unavailable, and presence never changes relationship eligibility.

## Send Integration

Normal `/send` recipient selection now receives only connected People. A People `Send` action opens the existing
P4 sender with the target opaque ID preselected. The P4 `SendSessionController` independently checks the current
eligible recipient source before selection and start, clears an ineligible pre-start selection, and preserves
existing stale-recipient/session protections. P4's isolated development fixture remains intact for its own tests.

## Active-Transfer Isolation

People relationships control future Send eligibility only. Blocking or removing a person during an already
authorized active transfer does not mutate transfer identity, integrity, recovery, completion, or cancellation.
The existing explicit transfer cancellation path remains the sole cancellation mechanism.

## Accessibility And Responsive Behavior

P6 reuses P3 components and provides named keyboard actions for invitation acceptance/decline, Send, management,
Remove, Block, and Unblock. It checks deliberate confirmation dialogs for destructive actions. Browser coverage
proves keyboard focus and no horizontal overflow at 1440, 1280, 1024, 768, and 390 CSS pixels with a long
Unicode-safe unknown-presence fixture name.

## Security And Privacy

The P6 review covers self pairing, duplicates, cross-invite convergence, stale operation results, blocked Send
bypass, code leakage, invalid-code privacy, display-name identity assumptions, unsafe display rendering, and
active-transfer isolation. The implementation uses opaque IDs, generic invalid-code copy, React text rendering,
revision guards, and repository/controller eligibility checks. People state contains no transfer or payload data.

## Tests

Focused Engine Lab tests cover relationship state, pairing direction, acceptance, decline, duplicate code creation,
cross-invite convergence, self pairing, expiry, remove, block, unblock, stale client/server revisions, stale
controller results, opaque-ID eligibility, and product error mapping.

Targeted browser qualification passed 6/6 P6 cases:

1. Pair, accept, P4 preselection, and a real small engine-backed P4 transfer.
2. Decline, duplicate-code idempotency, and cross-invite convergence.
3. Remove, block, unblock, blocked direct preselection exclusion.
4. Self and invalid-code generic error privacy.
5. Keyboard and responsive long-name/unknown-presence behavior.
6. Active-transfer isolation after a relationship block.

## P4 Regression

The P6-specific browser case proves a connected person enters the existing P4 route preselected and completes a
small real transfer. The final full-browser verification passed all seven retained P4 sender cases, including
recipient keyboard selection, source selection, review/start protection, interruption recovery, and delivered-only
completion.

## Engine Qualification Decision

P6 changes no engine package or engine runtime behavior. M4-M10 dedicated qualification is not required for P6.
The mandatory browser suite reran retained M4, M5, M6, P4, and P5 coverage. M6 bounded StreamPack folder,
corruption, recovery, source-mutation, and destination-checkpoint cases all passed.

## Repository Verification

All commands ran from the repository root with the bundled Node runtime on Windows.

| Command             | Actual result                                                                      |
| ------------------- | ---------------------------------------------------------------------------------- |
| `pnpm typecheck`    | `PASS` - 25/25 Turbo tasks                                                         |
| `pnpm lint`         | `PASS` - 14/14 Turbo tasks                                                         |
| `pnpm test`         | `PASS` - 25/25 Turbo tasks; Engine Lab 27/27 tests                                 |
| `pnpm test:e2e`     | `PASS` - 58 configured; 40 passed/executed; 18 environment-gated skipped; 0 failed |
| `pnpm build`        | `PASS` - 14/14 Turbo tasks                                                         |
| `pnpm format:check` | `PASS`                                                                             |

The six P6 Playwright cases all executed and passed; no P6-critical browser case was skipped. The 18 skips are
existing environment-gated large-payload, physical, coturn, lifecycle, or external-tool qualification scenarios,
not People cases or ordinary product integration coverage.

## Known Limitations And Deferred Work

- Production authentication: `DEFERRED -- P10`.
- Production database persistence: `DEFERRED -- P11`.
- Production invitation authorization: `DEFERRED`.
- Email delivery: `DEFERRED -- P20`.
- Global user discovery and contact import: `NOT IMPLEMENTED`.
- Transfer history: `P7`.
- Advanced recovery UX: `P8`.
- Deep accessibility audit: `P9`.
- Production TURN: `DEFERRED`.

## Acceptance Matrix

| Requirement                              | Result |
| ---------------------------------------- | ------ |
| AGENTS P6 boundary updated               | `PASS` |
| `/people` route                          | `PASS` |
| P3 components reused                     | `PASS` |
| People controller/repository boundary    | `PASS` |
| Opaque identity authority                | `PASS` |
| Relationship state machine               | `PASS` |
| Development pairing boundary documented  | `PASS` |
| Invite creation                          | `PASS` |
| Incoming invitation                      | `PASS` |
| Accept                                   | `PASS` |
| Decline                                  | `PASS` |
| Duplicate invite protection              | `PASS` |
| Cross-invite convergence                 | `PASS` |
| Self-invite protection                   | `PASS` |
| Remove                                   | `PASS` |
| Block                                    | `PASS` |
| Unblock                                  | `PASS` |
| Blocked person excluded from Send        | `PASS` |
| Connected People integrated into P4 Send | `PASS` |
| Active-transfer isolation                | `PASS` |
| Invalid invite privacy                   | `PASS` |
| Stale-operation protection               | `PASS` |
| Accessibility                            | `PASS` |
| Responsive layout                        | `PASS` |
| Security/privacy review                  | `PASS` |
| No P7+ scope creep                       | `PASS` |
| P4 regression                            | `PASS` |
| Repository verification                  | `PASS` |

## Next Phase

```text
NEXT PHASE:
P7 — TRANSFERS
```

P7 is not authorized or started during P6 closeout.
