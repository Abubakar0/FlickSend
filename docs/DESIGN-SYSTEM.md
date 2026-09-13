# FlickSend Design System

## Purpose

P3 provides the reusable, presentation-only foundation for later FlickSend V1 surfaces. It is designed for
a calm, spacious, high-trust creative tool: large folders and transfer outcomes must be readable without
turning the product into a technical dashboard. The system supports the future `Send`, `Transfers`,
`People`, and `Settings` model without implementing those workflows.

The implementation boundary is [`@flicksend/ui`](../packages/ui). It is deliberately independent of
transfer execution, WebRTC, signaling, filesystem adapters, database, billing, and authentication.

## Design Principles

- Make large transfer values easy to scan with tabular numerals and restrained hierarchy.
- Prefer surface and border hierarchy over stacks of floating cards.
- Use calm, direct copy and safe product labels rather than protocol or networking internals.
- Give every meaningful state text and shape/icon treatment in addition to color.
- Keep motion informative and brief; never make progress or recovery depend on animation.
- Keep the working brand replaceable until formal counsel review is complete.

## Tokens And Themes

`packages/ui/src/styles.css` is the token source. It provides semantic color, typography, spacing, radius,
border, elevation, motion, z-index, layout, and component-size variables. Components reference semantic
tokens such as `--fs-surface`, `--fs-text-primary`, `--fs-accent`, and `--fs-focus-ring`; literal brand
colors do not appear in component code.

Semantic color coverage is explicit: canvas/background, surface, elevated surface, muted surface, primary,
secondary, and muted text, default/strong borders, accent and on-accent text, success, warning, danger,
information, focus, disabled foreground/surface, and transfer-track values. The remaining token groups cover
type scale, 4px-derived spacing, radius, border width, elevation, motion/easing, z-index, page/container
layout, and component sizing. Local implementation values remain where they are structural rather than a
reusable design decision; P3 does not claim every pixel is a token.

The system provides intentional light and dark palettes. `ThemeProvider` supports `system`, `light`, and
`dark` preferences and stores only the local browser preference under `flicksend-theme-preference`. Theme
selection has no account or backend dependency. With `system`, no forced theme attribute is set and the
`prefers-color-scheme` media query supplies the initial palette. Manual selection sets the semantic theme
attribute, persists locally, and is restored when the provider mounts again.

The repository had no Tailwind configuration. P3 uses framework-independent CSS custom properties rather
than adding a styling framework that would compete with the existing stack. This is documented in
[ADR 040](adr/040-p3-presentation-only-design-system.md).

## Typography, Spacing, And Motion

Typography has `display`, `page`, `section`, `card`, `body`, `small`, `label`, `caption`, and `code`
levels. The stack uses local/system-safe fonts only; P3 adds no remote font request or font asset payload.

Spacing uses a fixed 4px-derived scale from `--fs-space-1` through `--fs-space-16`. Radii are limited to
small, medium, large, extra-large, and full. Elevation is reserved for overlays and elevated surfaces.

Motion uses shared fast, normal, and slow durations with named enter/exit/standard easing. The reduced-motion
media query collapses nonessential transition and animation duration. Status content remains available in
static text at all times.

## Layout And Responsiveness

`AppShell`, `Page`, `PageHeader`, `Section`, `Container`, `Stack`, `Inline`, `Cluster`, and
`ResponsivePanel` provide reusable page composition. The AppShell has semantic `nav` and `main` landmarks.
It shifts from a fixed desktop sidebar through narrow desktop/tablet layouts to an overflow-safe horizontal
mobile navigation treatment.

P3 validates visual rendering at desktop, narrow desktop, tablet-sized, and 390px widths. This is layout
evidence only and does not claim mobile transfer qualification. The product remains Windows-desktop-first.
The automated showcase checks 1440, 1280, 1024, 768, and 390px widths for horizontal overflow, and opens a
mobile dialog to confirm it remains within the viewport. Synthetic long person name, filename, error title,
and explanation fixtures exercise wrap/truncation behavior without using a local path.

## Component Families

- Foundations: brand mark, text, headings, links, tags, badges, separators, surfaces, cards, layout, and
  app shell.
- Actions and forms: buttons, icon buttons, labels, fields, input, textarea, select, checkbox, radio,
  switch, validation, loading, disabled, and focus-visible states.
- Overlays: accessible Radix dialog, confirmation dialog, sheet, popover, dropdown menu, tooltip, tabs,
  and accordion wrappers.
- Feedback: alerts, error surfaces, empty state, toast, spinner, skeleton, status labels, status badges,
  progress, verified progress, Transfer Health, and safe route labels.
- Transfer and People: file summaries, intentionally small file-type icon set, transfer card, non-filesystem
  drop-zone presentation, avatar, person chip/row, and presence indicator.

The complete status and later-phase boundary of each component is in
[UI-COMPONENT-INVENTORY.md](UI-COMPONENT-INVENTORY.md).

## Transfer-Specific Presentation

`Progress` has normal and indeterminate modes, accessible `progressbar` values, an explicit text label, and
supporting text. `VerifiedProgress` presents transferred and receiver-safe portions on one visual track with
a short legend rather than competing progress bars. It is visual only and does not inspect recovery blocks.

`StatusBadge`, `StatusDot`, and `StatusLabel` map P1 product states to user-facing language. Recovering is
not styled as terminal danger. `COMPLETED` is a presentation fixture only: a later state adapter may use it
only after its product reducer has observed engine `DELIVERED` for the same transfer identity.

`TransferHealth` consumes prepared `GOOD`, `UNSTABLE`, `RECONNECTING`, `SLOWER_THAN_EXPECTED`, and
`NOT_ENOUGH_INFORMATION` states. Low confidence softens wording; it never invents bottleneck logic. Route
presentation permits only `Direct` and `Relayed` labels, never candidate, address, credential, SDP, ICE, or
TURN details.

Formatting helpers use decimal consumer units (`MB`, `GB`, `MB/s`) and avoid false precision. Unknown ETA is
`Calculating…`, never `0 sec`.

## Errors And Statuses

`ProductErrorViewModel` accepts prepared title, explanation, recommended action, retryability, kind, and an
optional safe support reference. `ErrorCallout` and `ErrorPanel` intentionally omit raw engine/protocol
codes. Their fixture language follows [ERROR-TAXONOMY.md](ERROR-TAXONOMY.md): reconnecting is recoverable;
integrity and destination-finalization failures never resemble verified completion.

## Accessibility Rules

P3 targets WCAG 2.2 AA.

- Native semantic elements are used first; Radix handles complex overlay/control keyboard semantics.
- Icon-only buttons require an explicit accessible name; tooltip text is supplementary only.
- Labels, descriptions, and errors are visible and associated with their controls; validation does not
  depend on a red border alone.
- Dialogs, confirmation dialogs, menus, tabs, accordion, radios, checkboxes, switches, and selects preserve
  normal keyboard operation. Focus-visible is a single high-contrast semantic ring.
- Progressbars expose a name and `aria-valuenow/min/max` when determinate; indeterminate progress exposes
  a descriptive `aria-valuetext` instead of false numeric progress.
- Status has textual labels and color-independent dots/icons. Unknown presence remains unknown, never
  silently becomes unavailable.
- Components are designed for long names, large counts, zoom/reflow, and no fixed content-clipping heights.

Manual P9 follow-up checklist: keyboard-only traversal; screen-reader sanity; focus visibility; 200% zoom;
400% reflow; high contrast; reduced motion; target size; color independence; and error identification.

## Contrast Review

P3 performed a calculated token-pair review rather than claiming an exhaustive WCAG certification. The
reviewed light/dark text pairs are at or above the intended AA `4.5:1` threshold: primary `15.36/14.58`,
secondary `6.60/9.29`, muted `5.22/6.02`, on-accent `5.35/8.70`, success `4.52/6.42`, warning `5.11/6.35`,
danger `4.87/5.93`, and information `4.53/6.55`. The focus ring is `3.47:1` on the light surface and
`10.28:1` on the dark surface, exceeding the `3:1` non-text UI-indicator threshold. Success, warning,
danger, and information states also include words and icon/shape treatment, so color is never their sole
meaning.

The review is limited to the P3 token pairs. P9 retains responsibility for manual assistive-technology,
high-contrast, 200% zoom, and 400% reflow validation.

## Performance And Privacy

P3 imports individual Radix packages only for behaviorally complex primitives and uses a local SVG icon set.
It adds no chart, animation, font, illustration, analytics, backend, or transfer dependency. The showcase
uses synthetic names, sizes, and summaries only: no real filename, path, email, transfer ID, payload, or
credential is retained or rendered.

Components receive a prepared product snapshot rather than high-frequency engine metrics. This keeps M8
cadence and transfer correctness outside the visual system.

## Usage Example

```tsx
<TransferCard
  direction="sent"
  etaMs={5_820_000}
  fileCount={23_421}
  folderCount={1}
  person={{ name: "Alex Morgan", presence: "available" }}
  progress={67}
  sizeBytes={184_000_000_000}
  speedBytesPerSecond={12_400_000}
  status="TRANSFERRING"
  timestamp="Started 14 min ago"
  verifiedProgress={63}
/>
```

## Anti-Patterns

- Do not import engine, transport, recovery, integrity, StreamPack, filesystem, signaling, database, billing,
  or auth packages into `@flicksend/ui`.
- Do not bind a component directly to high-frequency engine samples or decide delivery/recovery correctness
  in a visual component.
- Do not expose raw protocol errors, candidate data, route addresses, credentials, full paths, or payload
  content.
- Do not use drag-and-drop as the only selection path, encode state only by color, disable focus outlines,
  or make a disappearing toast the sole transfer-failure surface.
- Do not turn the showcase into the P4 Send, P5 Receive, P6 People, P7 history, or Settings workflow.
