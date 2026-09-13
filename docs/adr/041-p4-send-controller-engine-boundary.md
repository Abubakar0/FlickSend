# ADR 041: P4 Send Controller Owns Product Orchestration

## Status

Accepted for P4.

## Context

The `/send` product flow needs source preparation, recipient/session coordination, lifecycle mapping, and recovery
presentation. Putting these concerns in React components would create an implicit product state machine and
encourage duplicated transfer correctness.

## Decision

`SendSessionController` is an application-layer adapter between `/send` and existing engine/filesystem
abstractions. It owns source preparation, picker orchestration, current-session coordination, explicit reducer
events, cancellation dispatch, and product error mapping. React renders its subscribed snapshot only.

The controller treats engine `DELIVERED` for the active transfer identity as the only completion authority. It may
not derive delivery, recovery, integrity, StreamPack, or resend behavior itself. `@flicksend/ui` remains
presentation-only and cannot import the controller or engine.

## Consequences

P4 can present real transfers without leaking WebRTC/FSTP details into components. Recipient fixtures and the P4
receiver harness remain replaceable development infrastructure. Future P5/P10 authorization work replaces those
integration contracts rather than being embedded in the controller.
