# ADR 045: Keep Recovery UX Presentation-Only

## Status

Accepted for P8.

## Context

FlickSend already has FSTP recovery, receiver-authoritative verified checkpoints, StreamPack recovery,
integrity verification, route recovery, and P4/P5 workflow state. Product users need clear recovery language and
safe actions, but a React recovery implementation must not become a second transfer state machine.

## Decision

P8 maps prepared P4/P5 snapshots and existing product errors into a deterministic application-level
`RecoveryViewModel`. `RecoveryNotice` renders that view model with existing presentation primitives. The mapping can
describe current automatic recovery, a completed recovery, action-required destination issues, and terminal issues;
it cannot decide whether bytes are committed, verified, recoverable, or delivered.

Existing P4/P5 controller actions remain the only action delegates. P8 does not add a resume engine, block map,
resend scheduler, route selector, recovery persistence, diagnostic transport, or protocol control.

## Consequences

`Your verified progress is safe.` is shown only for the currently supported prepared `RECONNECTING` state and the
short-lived restored acknowledgement. It is not used for source/destination mutation, permission loss,
cancellation, reload/restart, sleep, or offline behavior. A terminal recovery action starts a new attempt through
the existing workflow, which creates a new transfer identity; stale events cannot update it.

P8 does not add a reusable UI primitive. The composition remains in Engine Lab and preserves the
`@flicksend/ui` presentation-only boundary.
