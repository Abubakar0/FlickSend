# UI Component Inventory

## Closeout Summary

```text
IMPLEMENTED: 74
DEFERRED_TO_P4: 0
DEFERRED_TO_P5: 0
DEFERRED_TO_P6: 0
DEFERRED_TO_P7: 0
DEFERRED_TO_P8: 0
NOT_NEEDED: 4
```

The counts cover P3 presentation components and future workflow compositions only. A P9 accessibility
audit is a validation activity, not a component, so it is documented in `DESIGN-SYSTEM.md` rather than
assigned a component status. Every implemented item is exported from `@flicksend/ui`; aliases below name
the accepted wrapper that provides the requested behavior.

## Implemented

| Component           | Status        | P3 boundary                                                                                                      |
| ------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `BrandMark`         | `IMPLEMENTED` | Consumes the centralized working-brand object only.                                                              |
| `ThemeProvider`     | `IMPLEMENTED` | Local system/light/dark preference; no account or backend state.                                                 |
| `ThemeControl`      | `IMPLEMENTED` | Accessible local theme-choice control.                                                                           |
| `Button`            | `IMPLEMENTED` | Named action, loading, and disabled presentation.                                                                |
| `IconButton`        | `IMPLEMENTED` | Requires an explicit accessible name.                                                                            |
| `Link`              | `IMPLEMENTED` | Styled native anchor only.                                                                                       |
| `Text`              | `IMPLEMENTED` | Semantic typography wrapper.                                                                                     |
| `Heading`           | `IMPLEMENTED` | Semantic heading-level and scale wrapper.                                                                        |
| `Badge`             | `IMPLEMENTED` | Textual status/tag presentation.                                                                                 |
| `Tag`               | `IMPLEMENTED` | Neutral compact metadata label.                                                                                  |
| `Separator`         | `IMPLEMENTED` | Styled native horizontal rule.                                                                                   |
| `Surface`           | `IMPLEMENTED` | Base/elevated visual surface.                                                                                    |
| `Card`              | `IMPLEMENTED` | Bounded content composition surface.                                                                             |
| `Stack`             | `IMPLEMENTED` | Vertical spacing primitive.                                                                                      |
| `Inline`            | `IMPLEMENTED` | Inline alignment and spacing primitive.                                                                          |
| `Cluster`           | `IMPLEMENTED` | Wrapping inline grouping primitive.                                                                              |
| `Container`         | `IMPLEMENTED` | Width containment primitive.                                                                                     |
| `Section`           | `IMPLEMENTED` | Semantic section primitive.                                                                                      |
| `Page`              | `IMPLEMENTED` | Semantic main-content primitive.                                                                                 |
| `PageHeader`        | `IMPLEMENTED` | Page heading/action composition only.                                                                            |
| `ResponsivePanel`   | `IMPLEMENTED` | Responsive panel layout only.                                                                                    |
| `AppShell`          | `IMPLEMENTED` | Navigation/main layout; no routes or product workflow.                                                           |
| `Input`             | `IMPLEMENTED` | Native text input styling and attributes.                                                                        |
| `Textarea`          | `IMPLEMENTED` | Native multiline input styling and attributes.                                                                   |
| `NativeSelect`      | `IMPLEMENTED` | Native-select fallback primitive.                                                                                |
| `Select`            | `IMPLEMENTED` | Accessible Radix select wrapper.                                                                                 |
| `Checkbox`          | `IMPLEMENTED` | Accessible Radix checkbox wrapper.                                                                               |
| `RadioGroup`        | `IMPLEMENTED` | Provides the requested radio behavior through Radix.                                                             |
| `Switch`            | `IMPLEMENTED` | Accessible Radix switch wrapper.                                                                                 |
| `Label`             | `IMPLEMENTED` | Native label association.                                                                                        |
| `Field`             | `IMPLEMENTED` | Labels, description/error association, and invalid-state wiring.                                                 |
| `FormMessage`       | `IMPLEMENTED` | Error message with alert semantics.                                                                              |
| `Tooltip`           | `IMPLEMENTED` | Supplementary Radix tooltip; never the only accessible name.                                                     |
| `Popover`           | `IMPLEMENTED` | Focus-managed Radix popover.                                                                                     |
| `DropdownMenu`      | `IMPLEMENTED` | Provides the requested dropdown/menu behavior through Radix.                                                     |
| `Dialog`            | `IMPLEMENTED` | Titled/described focus-managed modal wrapper; P12 added optional controlled open state for secret-state cleanup. |
| `ConfirmDialog`     | `IMPLEMENTED` | Provides the requested AlertDialog behavior through Radix.                                                       |
| `Sheet`             | `IMPLEMENTED` | Provides the requested Sheet/Drawer behavior with a side property.                                               |
| `Tabs`              | `IMPLEMENTED` | Keyboard-operable Radix tabs wrapper.                                                                            |
| `Accordion`         | `IMPLEMENTED` | Keyboard-operable Radix accordion wrapper.                                                                       |
| `ToastProvider`     | `IMPLEMENTED` | Secondary Radix toast presentation only.                                                                         |
| `Spinner`           | `IMPLEMENTED` | Named loading status.                                                                                            |
| `Skeleton`          | `IMPLEMENTED` | Decorative loading placeholder.                                                                                  |
| `Alert`             | `IMPLEMENTED` | Informational/success/warning/danger callout.                                                                    |
| `InlineError`       | `IMPLEMENTED` | Compact alert-semantic error text.                                                                               |
| `ErrorCallout`      | `IMPLEMENTED` | Prepared product error with retry and safe support reference.                                                    |
| `ErrorPanel`        | `IMPLEMENTED` | Prepared terminal/action-required error surface.                                                                 |
| `EmptyState`        | `IMPLEMENTED` | Empty-data presentation only.                                                                                    |
| `StatusDot`         | `IMPLEMENTED` | Decorative state shape paired with textual status.                                                               |
| `StatusLabel`       | `IMPLEMENTED` | Prepared P1 state label.                                                                                         |
| `StatusBadge`       | `IMPLEMENTED` | Prepared P1/P7 state badge, including `WAITING_FOR_SENDER`; presentation-only.                                   |
| `Progress`          | `IMPLEMENTED` | Determinate or truthful indeterminate progressbar.                                                               |
| `VerifiedProgress`  | `IMPLEMENTED` | One track for transferred and receiver-safe progress.                                                            |
| `TransferHealth`    | `IMPLEMENTED` | Prepared M8 product-health snapshot only.                                                                        |
| `RouteLabel`        | `IMPLEMENTED` | Allows only `Direct` or `Relayed`.                                                                               |
| `Avatar`            | `IMPLEMENTED` | Initials/avatar presentation only.                                                                               |
| `PersonChip`        | `IMPLEMENTED` | Compact person presentation only.                                                                                |
| `PersonRow`         | `IMPLEMENTED` | Person summary/action composition only.                                                                          |
| `PresenceIndicator` | `IMPLEMENTED` | Distinguishes available, unavailable, and unknown.                                                               |
| `FileTypeIcon`      | `IMPLEMENTED` | Local file/folder-type icon wrapper.                                                                             |
| `Icon`              | `IMPLEMENTED` | Local inline SVG icon primitive; no icon package.                                                                |
| `FileSummary`       | `IMPLEMENTED` | Bounded display name, counts, and size; no full path rendering.                                                  |
| `TransferCard`      | `IMPLEMENTED` | Prepared product presentation props only.                                                                        |
| `DropZone`          | `IMPLEMENTED` | Idle, drag-active, invalid, and disabled presentation plus future selection callbacks.                           |
| `Metric`            | `IMPLEMENTED` | Compact prepared metric presentation.                                                                            |

## Deferred Workflow Compositions

| Component/composition                | Status        | Rationale                                                    |
| ------------------------------------ | ------------- | ------------------------------------------------------------ |
| Send composer                        | `IMPLEMENTED` | P4 composes existing UI primitives in the application route. |
| Source-selection orchestration       | `IMPLEMENTED` | P4 controller owns filesystem orchestration outside UI.      |
| Send review and confirmation surface | `IMPLEMENTED` | P4 provides review and a single Send action.                 |
| Recipient acceptance surface         | `IMPLEMENTED` | P5 composes existing primitives in `/receive/[session]`.     |
| Destination-selection composition    | `IMPLEMENTED` | P5 controller owns browser destination orchestration.        |
| People relationship management       | `IMPLEMENTED` | P6 composes existing People primitives with app-layer state. |
| Transfers history composition        | `IMPLEMENTED` | P7 composes prepared lifecycle metadata in `/transfers`.     |
| SpeedProof/diagnostics page          | `IMPLEMENTED` | P7 presents reduced prepared M8 output only.                 |
| Recovery-message composition         | `IMPLEMENTED` | P8 application composition uses existing P3 primitives only. |

P8 adds no new `@flicksend/ui` export. `RecoveryNotice` is an Engine Lab application composition over existing
`Card`, `Heading`, `Text`, and `Button` primitives, and consumes a prepared presentation view model only.

P9 makes narrow presentation-only corrections to existing P3 primitives: decorative avatars are hidden from
the accessibility tree when a person name is present, spinner status uses a visually-hidden label, progress
programmatically describes verified progress, and low-confidence health/terminal supporting text preserves
contrast. The shared disabled-button treatment uses solid reviewed tokens rather than opacity blending.
Shared buttons avoid foreground/background colour transitions so every rendered action state retains its
reviewed contrast. These corrections add no export, workflow, engine, route, or product-state behavior and
do not reopen P3 generally.

## Not Needed In P3

| Item                        | Status       | Rationale                                                          |
| --------------------------- | ------------ | ------------------------------------------------------------------ |
| Drawer as a separate export | `NOT_NEEDED` | `Sheet` provides the accepted side-panel behavior.                 |
| Charting/metrics dashboard  | `NOT_NEEDED` | Not part of the P1/P3 foundation and would add unjustified weight. |
| Context-menu system         | `NOT_NEEDED` | No accepted P3 workflow requires one.                              |
| Full competing UI framework | `NOT_NEEDED` | P3 uses local primitives and selective Radix behavior only.        |
