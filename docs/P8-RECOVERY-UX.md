# P8 Recovery UX

## Purpose

P8 makes recovery understandable without moving recovery correctness into the product UI. The user-facing concept
is simple: already verified progress is preserved while the existing engine performs a supported reconnect. The UI
never infers delivery from progress, estimates, or React state.

## Boundary

```text
P4/P5 prepared workflow snapshot and product error
                    |
                    v
       P8 recovery presentation mapping
                    |
                    v
       RecoveryNotice application composition
```

The source snapshot and error mapping remain authoritative. P8 does not create a RecoveryManager, FSTP resume
logic, logical block map, resend policy, route selector, signaling flow, destination writer, or delivery state.
Only engine `DELIVERED` for the same active transfer identity can produce product `COMPLETED`.

## Presentation Model

The presentation model has four modes:

| Mode              | Meaning                                                                | Safety wording                       | Primary control                                             |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `automatic`       | Existing engine recovery is active.                                    | `Your verified progress is safe.`    | None; cancel remains available in the existing workflow.    |
| `recovered`       | A short, one-time acknowledgement after recovery resumes.              | `Continuing from verified progress.` | None.                                                       |
| `action_required` | A local user action can be safely delegated to an existing P4/P5 flow. | No preservation claim.               | Specific source/destination/new-send action.                |
| `terminal`        | The active attempt cannot safely continue.                             | No preservation claim.               | Start a new send or ask the sender to begin a new transfer. |

The exact mapping is in [P8-RECOVERY-ACTION-MATRIX.md](P8-RECOVERY-ACTION-MATRIX.md), and the exact copy is in
[P8-RECOVERY-COPY.md](P8-RECOVERY-COPY.md).

## Sender And Recipient Behavior

The existing P4 sender route and P5 receiver route render a `RecoveryNotice` from the same deterministic mapper.
Automatic reconnection is concise, has status semantics, and has no manual reconnect control. A successful
transition announces `Connection restored` once, then returns to the actual transfer state.

Terminal route exhaustion is checked before a `RECONNECTING` presentation, preventing an infinite-looking spinner.
P4 source mutation offers source reselection. P5 destination issues offer only the already-supported destination
selection action. A recipient is never offered an invented download/retry action, and changed destinations are not
overwritten.

## Peer Waiting

Peer waiting is not a failed recovery. Before a sender has a live peer, P4 uses `WAITING_FOR_RECIPIENT`, gives a
person-centered `Waiting for [recipient]` status, and starts normally when that recipient joins. Once P5 has an
authorized offer and a prepared destination, a temporarily unavailable sender maps to `WAITING_FOR_SENDER`; the
existing transfer identity and prepared destination remain intact until normal receipt continues. Neither state
makes a verified-progress preservation claim or creates a replacement transfer identity.

## Verified Progress, Integrity, And Completion

The safety claim concerns only receiver-authoritative verified commits from the supported current recovery flow. It
does not mean the entire transfer is complete. Integrity retry uses neutral `Checking transferred data` wording;
integrity exhaustion says that nothing was marked complete. Finalization failure is terminal. Every completion view
still requires the engine's `DELIVERED` event for the active transfer identity.

## Retry, Cancel, And History

Cancellation stays distinct from failure during automatic recovery. Starting again after terminal recovery uses the
existing reset/start flow, creates a new transfer identity, and isolates late events from the failed attempt. P7
observes the existing lifecycle and keeps one safe record across automatic reconnects; it does not become a recovery
console.

## Safe Details And Privacy

Optional details contain only prepared route label, aggregate reconnect count, integrity-retry count, and safe
Transfer Health information. They never show a path, filename, manifest, hash, payload content, transfer/session
identity, address, candidate, SDP, credential, raw engine code, stack trace, or raw diagnostic record. P8 adds no
telemetry, support submission, persistence, authentication, or service integration.

## Browser Lifecycle Limits

P8 makes no claim for refresh, browser restart, backgrounding, sleep, or offline continuity. M9 records bounded
fixture refresh/restart as `NOT_SUPPORTED`, and P8 does not imply otherwise. Browser-capability failures use the
existing capability decision and product error mapping.

## Accessibility And Responsive Behavior

Automatic and recovered notices use `role=status`; action-required and terminal notices use `role=alert`. Headings,
explanations, and actions are textual, and optional safe details use native disclosure. The composition reflows at
the Engine Lab mobile breakpoint without horizontal overflow. P8 browser evidence covers 1440, 1280, 1024, 768,
and 390 px widths.

## Qualification Scope

P8 browser qualification uses real P4/P5 engine-backed sender and recipient transfers. It covers automatic
reconnect, restored acknowledgement, route exhaustion, source mutation, destination mutation, permission and
storage faults, integrity retry/exhaustion, finalization and service failures, cancellation, a new post-failure
identity, and P7 recovery presentation.

`M4-M10 DEDICATED QUALIFICATION: NOT RERUN — NO ENGINE CORRECTNESS CHANGE`.

P8 consumes existing qualified engine behavior and changes no FSTP, recovery, integrity, StreamPack, route, TURN,
capability, or benchmark code. Its added sender reset regression test preserves the browser capability decision
across a new product attempt; it does not change engine behavior.
