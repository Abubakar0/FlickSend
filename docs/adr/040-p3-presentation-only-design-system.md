# ADR 040: Establish A Presentation-Only, Brand-Swappable P3 Design System

## Status

Accepted for P3 on 2026-09-10.

## Context

P1 freezes FlickSend as a person-to-person huge-file handoff, while P2 allows the name only as a working
brand pending counsel review. Later product surfaces need consistent, accessible visual primitives without
pulling transfer correctness, WebRTC, signaling, database, billing, or authentication concerns into React
components.

## Decision

Create `@flicksend/ui` as the presentation boundary. It depends only on React, selective Radix primitives,
and `@flicksend/shared` brand metadata. It exposes semantic CSS custom-property tokens, a local theme
preference, typed product-presentation state, formatting helpers, and reusable components. The development
showcase is an isolated `/design-system` Engine Lab route with synthetic fixtures only.

The current working brand is centralized in `@flicksend/shared` and re-exported by the UI package. Product
name, tagline, wordmark, favicon reference, accent token, and working-brand legal status may be changed
there without redesigning individual components.

## Consequences

- `@flicksend/ui` must not import engine, transport, resume, integrity, StreamPack, filesystem, signaling,
  database, billing, or auth modules.
- P3 does not implement Send, Receive, history, People relationships, Settings, or authentication flows.
- Components render prepared product state; they do not classify transfer health or determine completion.
- Product `COMPLETED` presentation remains reserved for a future integration that has observed `DELIVERED`.
- CSS custom properties were selected because the repository had no Tailwind configuration; no competing UI
  framework, chart library, font payload, or icon package was added.
