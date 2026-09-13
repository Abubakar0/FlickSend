# ADR 042: P5 Receive Controller Keeps Authorization, Destination, And Engine Concerns Separate

## Status

Accepted for P5.

## Context

The recipient route needs to accept a session, reveal offer metadata only after authorization, prepare a browser
destination, map lifecycle/errors, and present recovery. Putting this work in React would duplicate product state
and blur the boundary between a safe destination, protocol correctness, and future production invitation policy.

## Decision

`ReceiveSessionController` is the application-layer adapter between `/receive/[session]`, existing engine
receive APIs, and browser destination adapters. It owns session/destination revisions, native picker invocation,
metadata-only recovery-store creation, cancellation dispatch, and product error mapping. React renders its
snapshot only. It maps completion solely from `DELIVERED` for the active transfer identity.

The controller renders no offer metadata until the existing engine reports an authorized `READY` offer. The
deterministic development session fixture may support browser qualification but is explicitly not production
invitation security or a future authorization architecture. Native save-file and directory picker failure does
not fall back to Blob accumulation, whole-file memory, or payload persistence.

## Consequences

P5 can qualify real M5/M6 receive, recovery, and delivery without moving FSTP, integrity, StreamPack, route, or
destination correctness into React. Future P10 production authorization replaces the development session policy
outside `engine-core`; it must retain the pre-authorization privacy guarantee. `@flicksend/ui` stays unable to
import the controller or engine.
