# P3 Design System Report

## Status

```text
P3 DESIGN SYSTEM: COMPLETE
P3 FINAL VERIFICATION: PASS
DESIGN FOUNDATION: FROZEN
```

P3 creates reusable visual infrastructure only. It does not start P4 Core Send UX, P5 Receive UX,
authentication, billing, database/API work, production signaling/TURN, SEO, marketing, or product workflows.

Final verification used the repository-compatible Node `v24.19.0` runtime. The machine-wide `node` command
currently resolves to Node 20, which cannot start the current Wrangler development worker; this is an
environment PATH condition, not a repository dependency or P3 implementation issue.

## Design Direction

The design system freezes a modern, minimal, spacious, high-trust, fast-feeling, and calm creative-tool
character. It avoids dashboard density, crypto/gaming styling, decorative gradients, excessive glass,
neon-heavy color, and motion for its own sake. The system is tuned for large work summaries such as
`184 GB`, `23,421 files`, `12.4 MB/s`, and `1h 37m` without presenting a monitoring console.

## Architecture And Boundary

`@flicksend/ui` is a React presentation package with selective Radix primitives, local SVG icons/styles, and
shared working-brand metadata only. Its package manifest and source-import audit contain no engine core,
WebRTC transport, resume, integrity, StreamPack, filesystem, signaling, database, billing, or authentication
dependency. It receives prepared product snapshots and callbacks; it does not subscribe to engine metrics,
poll WebRTC, call filesystem APIs, start transfers, connect signaling, or decide delivery correctness.

## Boundary, Brand, And Privacy Audit

The direct runtime dependencies are `@flicksend/shared` and selective Radix primitive packages; React and
React DOM remain peers. The closeout source scan returned zero forbidden imports, zero hard-coded working-brand
name/tagline/favicon/hex values in reusable UI TSX, and zero high-frequency timer/WebRTC/filesystem APIs.
Working product copy derives from `workingBrand.shortName`; within reusable UI, only token CSS owns brand hex
values. The separate working favicon SVG is the documented static asset exception.

The fixture-only showcase was manually reviewed and pattern-scanned for real emails, usernames, paths,
transfer/session IDs, credentials, and production endpoints. Its only values are explicit synthetic examples;
the descriptive words “credentials”, “transfer identifiers”, and “paths” appear solely to state that they are
not exposed. No P4 source-selection orchestration, Send flow, recipient/People workflow, history, settings,
authentication, or transfer execution entered P3.

## Brand-Swappable Architecture

Working brand metadata now has one source in `@flicksend/shared` and is re-exported by `@flicksend/ui`.
Name, short name, tagline, wordmark, favicon reference, semantic accent token, and current legal-asset status
are centralized. The UI uses semantic accent variables rather than component-level brand colors.

The development mark and `/icon.svg` favicon reference are intentionally working assets, not a final
legal-cleared identity. Name, short name, tagline, wordmark, symbol reference, favicon, accent token, and
legal status are replaceable from the central object. See [BRAND-TOKENS.md](BRAND-TOKENS.md) and
[ADR 040](adr/040-p3-presentation-only-design-system.md).

## Tokens

`packages/ui/src/styles.css` implements semantic tokens for color, type, spacing, radius, border,
elevation, motion, z-index, layout, and component sizes. Light and dark mode have separate intentional
surface, text, border, accent, state, and focus values. `ThemeProvider` supports system/light/dark with a
safe browser-local preference only.

The repository had no Tailwind configuration, so P3 uses CSS custom properties instead of adding a competing
styling framework. No Material UI, Ant, Bootstrap, Chakra, chart library, font payload, or icon package was
introduced.

## Themes

The initial `system` mode leaves `data-theme` unset so `prefers-color-scheme` supplies the intentional light
or dark palette. Manual `light` and `dark` selection updates the root semantic-token scope, persists only
the local preference, and restores it on the next provider mount. There is no account, API, or database
dependency. Component and browser tests cover system reset, manual selection, local persistence, restoration,
and dark-mode rendering of the default, active, success, warning, danger, recovering, disabled, and focus
states present in the showcase.

## Typography

The type hierarchy covers display, page, section, card, body, small body, label, caption, and code/diagnostic
text. Transfer-facing values use tabular numerals. `AppShell`, `Page`, `PageHeader`, `Section`, `Container`,
`Stack`, `Inline`, `Cluster`, and `ResponsivePanel` provide the layout foundation.

## Layout And Responsiveness

The AppShell uses semantic main/navigation landmarks and shifts from desktop sidebar to a responsive horizontal
navigation treatment. The showcase is exercised at 1440px, 1280px, 1024px, 768px, and 390px; CSS provides
the responsive foundation and the browser test checks for horizontal overflow at each width. Synthetic long
filename/person/error fixtures and a mobile dialog prove wrapping and bounded overlay width. This is layout
evidence only, not a mobile-transfer support claim.

## Components Implemented

The P3 inventory covers foundations, actions, forms, overlays, feedback, transfer, and People primitives.
It includes accessible Radix wrappers for dialogs, confirmation dialogs, sheets, menus, popovers, tabs,
accordion, select, checkbox, radio, switch, tooltip, and toast. All implementation/deferment decisions are in
[UI-COMPONENT-INVENTORY.md](UI-COMPONENT-INVENTORY.md): 65 implemented presentation components and nine
explicitly owned future workflow compositions. There are no ambiguous component entries.

## Transfer-Specific Primitives

`Progress` has accessible determinate/indeterminate behavior. `VerifiedProgress` represents transferred and
verified-safe portions in one track. `StatusBadge`, `StatusDot`, and `StatusLabel` use P1 product states with
human-facing labels. `TransferHealth` accepts prepared advisory state and softens low-confidence output;
it contains no M8 classification logic. `RouteLabel` accepts only `Direct` and `Relayed`.

`TransferCard`, `FileSummary`, the limited icon family, and `DropZone` are typed presentation primitives.
They use fixture props only and do not access file pickers, filesystem handles, engines, recovery stores, or
transfer transport.

## People Primitives

Avatar, person chip/row, and presence indicator support available, unavailable, and unknown without silently
equating unknown to unavailable. They are synthetic/presentation-only inputs; P3 creates no People lookup,
relationship, invitation, or backend behavior. The closeout tests explicitly retain the `Availability unknown`
accessible label rather than mapping it to unavailable.

## Error And Status Primitives

`InlineError`, `ErrorCallout`, and `ErrorPanel` accept prepared `ProductErrorViewModel` values aligned to
[ERROR-TAXONOMY.md](ERROR-TAXONOMY.md): title, plain explanation, recommended action, retryability, and an
optional already-safe support reference. They do not map engine errors and ordinary P3 fixtures contain no raw
engine code, stack trace, SDP, candidate, address, credential, transfer/session identifier, or full path.

Reconnecting is a recoverable `info` callout with explicit preserved-progress language; terminal failures use
a distinct danger panel and do not claim completion. Tests assert this distinction. `StatusBadge`, `StatusDot`,
and `StatusLabel` pair text with shape/icon/color, so state is not color-only.

P3 documents that a later product reducer may show product `COMPLETED` only after observing `DELIVERED`, as
required by [TRANSFER-STATE-MAPPING.md](TRANSFER-STATE-MAPPING.md). No P3 helper derives `COMPLETED` from
percentages, verified bytes, or byte-complete states; fixtures may render an explicitly supplied product state.

## Accessibility

P3 targets WCAG 2.2 AA. Automated component tests cover semantic button state, field labels/error alerts,
field description/error associations, icon-only button names, progressbar determinate/indeterminate values,
dialog and AlertDialog name/description, checkbox/radio/switch semantics, tabs, menu, and local theme choice.
The browser test covers semantic navigation, responsive rendering, theme switching, visible focus, reduced
motion, and no P3 console/page errors.

The design system defines a persistent focus-visible ring, respects reduced motion, uses text/icon/shape in
addition to state color, and supports labeled non-drag actions in the DropZone primitive. P9 remains the
owner of the deeper manual assistive-technology audit; the manual checklist is in
[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Keyboard And Focus

Representative wrapper behavior is exercised with `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, and arrow
keys. AlertDialog focus remains inside its action pair, Enter opens the menu, ArrowDown moves its active item,
Escape dismisses overlays, ArrowRight activates the next tab, and Space toggles a focused switch. The browser
smoke test confirms keyboard focus matches the shared `:focus-visible` styling rule. Native controls and Radix
wrappers retain logical DOM order; P3 adds no mouse-only critical primitive.

## Reduced Motion

The real `prefers-reduced-motion: reduce` CSS branch shortens nonessential transition/animation duration to
`1ms` and prevents repeated animation. The browser smoke test emulates reduced motion and confirms the
indeterminate progress animation computes to `0.001s`; all state meaning remains in text and shape.

## Privacy

P3 fixtures use synthetic names, counts, filenames, support references, and error copy only. The closeout
search found no real email, username, filesystem path, transfer ID, credential, or production endpoint in the
design-system showcase. `FileSummary` additionally renders a basename only if a caller accidentally supplies
a path-like string. No P3 component logs content or diagnostic data.

## Performance And Dependency Review

P3 uses individual Radix packages for complex headless behavior and local inline SVG icons for the small
file/type/action set. It adds no engine dependency, charting, heavy animation, external font, analytics, or
marketing-asset payload. UI components receive prepared snapshots rather than high-frequency engine samples.
No formal P3 bundle analyzer exists, so `BUNDLE IMPACT: REVIEWED QUALITATIVELY`. Production builds remain
the regression guard; no byte count is claimed.

## Component Showcase

The development-only Engine Lab route `/design-system` demonstrates tokens, light/dark preference,
typography, buttons, forms, overlays, alerts, transfer primitives, People primitives, empty states, and
responsive layout. It includes default/active/success/warning/danger/recovering/disabled/focus states in both
themes, determinate/indeterminate/verified progress, route labels, terminal/recoverable errors, long-content
stress fixtures, and loading/empty presentation. It contains synthetic fixture values and does not start
transfers, connect signaling, require authentication, invoke filesystem APIs, or write data.

## Documents Created Or Updated

- Created [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).
- Created [BRAND-TOKENS.md](BRAND-TOKENS.md).
- Created [UI-COMPONENT-INVENTORY.md](UI-COMPONENT-INVENTORY.md).
- Created [ADR 040](adr/040-p3-presentation-only-design-system.md).
- Created this report.
- Updated [AGENTS.md](../AGENTS.md), [ADR index](adr/README.md), shared working-brand metadata, Engine Lab
  configuration, and Engine Lab styling.

## Tests

P3 now has 21 focused UI Vitest tests for formatting, theme restoration, variants, field association,
determinate/indeterminate progress, recoverable/terminal status, unknown presence, safe display names,
drop-zone states, accessible names, and representative keyboard behavior. One Playwright showcase smoke test
covers route loading, no P3 page/console error, theme control, semantic states, reduced motion, mobile dialog
width, and 1440/1280/1024/768/390px overflow checks. No P3-critical test is environment-gated.

## Repository Verification

M7-M10 dedicated qualification commands were not rerun because P3 did not change engine/runtime transfer
code. The normal E2E suite re-executed its active existing browser coverage; its large-fixture, TURN/coturn,
and headed-lifecycle tests remain explicitly environment-gated rather than being P3 gaps.

| Command             | Result                                                        |
| ------------------- | ------------------------------------------------------------- |
| `pnpm typecheck`    | `PASS` - 25 Turbo tasks                                       |
| `pnpm lint`         | `PASS` - 14 Turbo tasks                                       |
| `pnpm test`         | `PASS` - 24 Turbo tasks; 146 Vitest assertions                |
| `pnpm test:e2e`     | `PASS` - 17 passed; 18 environment-gated tests skipped        |
| `pnpm build`        | `PASS` - 14 Turbo tasks; Engine Lab includes `/design-system` |
| `pnpm format:check` | `PASS`                                                        |

## Known Limitations

- FlickSend remains a working brand pending counsel; P3 creates no final identity, purchase, registration, or
  public legal claim.
- Responsive design does not qualify mobile transfer behavior.
- Full accessibility audit, real screen-reader/device checks, and product workflow validation remain later
  work.
- The fixture-only showcase is not a product page or an engine integration.

## Deferred Product Flows

- Final Send composer and review: P4.
- Recipient invitation/acceptance and destination handling: P5.
- People relationship behavior: P6.
- Transfer history composition: P7.
- Full recovery-message composition: P8.
- Deep accessibility audit: P9.

## Acceptance Matrix

| Requirement                                | Result |
| ------------------------------------------ | ------ |
| `@flicksend/ui` presentation-only boundary | `PASS` |
| Brand centralized/swappable                | `PASS` |
| Semantic token system                      | `PASS` |
| Light/dark/system theme                    | `PASS` |
| Core primitives                            | `PASS` |
| Transfer-specific primitives               | `PASS` |
| People primitives                          | `PASS` |
| Error/status primitives                    | `PASS` |
| Progress accessibility                     | `PASS` |
| Keyboard/focus                             | `PASS` |
| Reduced motion                             | `PASS` |
| Responsive showcase                        | `PASS` |
| WCAG 2.2 AA design target                  | `PASS` |
| Component inventory complete               | `PASS` |
| No P4+ scope creep                         | `PASS` |
| Repository verification                    | `PASS` |

## Next Phase

```text
NEXT PHASE:
P4 — CORE SEND UX
```

P4 has not started.
