# P9 Accessibility Audit

## Target And Evidence

P9 uses WCAG 2.2 AA as an implementation target. It is not a certification or a claim of complete
WCAG conformance. Evidence is labelled `AUTOMATED`, `BROWSER-VERIFIED`, `CODE-INSPECTED`,
`MANUAL/ASSISTED`, or `NOT TESTED`.

The qualified V1 platform remains Chrome stable and Edge stable on Windows. P9 browser evidence uses
the configured Playwright Chromium channel and is not independent Edge evidence.

## Issue Log

| ID       | Surface                                            | Criterion                | Severity | Evidence                         | Problem and user impact                                                                                                                                                                                            | Fix                                                                                                                                                                                   | Verification                                                                               | Status |
| -------- | -------------------------------------------------- | ------------------------ | -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| A11Y-001 | Shared health, error, and transfer-card primitives | 1.4.3 Contrast (Minimum) | HIGH     | AUTOMATED                        | Axe found four serious text-contrast violations in the design-system showcase. Low-confidence opacity, muted text over coloured panels, and an over-broad avatar selector made small supporting text hard to read. | Removed opacity as a confidence cue, used a dashed border instead, raised support/confidence text to the secondary token, and limited the transfer-card selector to textual metadata. | P9 axe scan reports zero violations; token ratios are recorded in `P9-CONTRAST-REVIEW.md`. | FIXED  |
| A11Y-002 | P5 recipient waiting                               | No criterion asserted    | MEDIUM   | CODE-INSPECTED, BROWSER-VERIFIED | The recipient prepared-destination state used the `WAITING_FOR_RECIPIENT` badge while the copy and state were waiting for the sender. The mismatch could mislead screen-reader and visual users.                   | Render `WAITING_FOR_SENDER` for the recipient waiting state.                                                                                                                          | P9 recipient/recovery browser flow and retained P5 tests.                                  | FIXED  |
| A11Y-003 | Shared person presentation                         | 1.1.1 Non-text Content   | MEDIUM   | CODE-INSPECTED                   | Decorative avatar initials repeated a person's already visible and programmatic name.                                                                                                                              | Mark avatar initials decorative; retain the explicit person name and labelled presence indicator.                                                                                     | UI unit test confirms `aria-hidden`; P9 axe scans pass.                                    | FIXED  |
| A11Y-004 | Shared verified progress                           | No criterion asserted    | MEDIUM   | CODE-INSPECTED, BROWSER-VERIFIED | The visible verified-progress sentence was not associated with the progressbar. Assistive technology could receive the overall percentage without its safe/verified distinction.                                   | Associate supporting text through `aria-describedby`.                                                                                                                                 | UI unit test and P9 Send/Receive browser flows.                                            | FIXED  |
| A11Y-005 | Shared loading spinner                             | No criterion asserted    | LOW      | CODE-INSPECTED                   | A spinner had an accessible name but no text node in its status region.                                                                                                                                            | Add a proper visually-hidden status label.                                                                                                                                            | UI unit test and P9 axe scans.                                                             | FIXED  |
| A11Y-006 | Shared brand mark                                  | No criterion asserted    | LOW      | CODE-INSPECTED                   | A generic brand container carried an unnecessary ARIA label while its visible wordmark already names it.                                                                                                           | Remove the redundant generic ARIA label.                                                                                                                                              | P9 axe scans.                                                                              | FIXED  |
| A11Y-007 | Shared primary button primitive                    | 1.4.3 Contrast (Minimum) | HIGH     | AUTOMATED                        | Axe captured a 3.96:1 intermediate pair while an active selected-recipient action transitioned its foreground and background independently. The control was not disabled.                                          | Remove foreground/background transitions from shared button state changes; retain only border and transform motion. Disabled controls also use reviewed solid token pairs.            | Token contrast test plus explicit Light and Dark P9 axe scans.                             | FIXED  |

## Review Summary

| Area                                          | Evidence                         | Result                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headings, landmarks, navigation current state | CODE-INSPECTED, BROWSER-VERIFIED | One page `h1`, `main`, labelled primary navigation, and `aria-current="page"` on normal product routes.                                                                |
| Forms and controls                            | CODE-INSPECTED, BROWSER-VERIFIED | Native/Radix controls are labelled; pairing input has a programmatic label; product actions have descriptive names.                                                    |
| Dialogs and destructive confirmation          | BROWSER-VERIFIED                 | Radix dialogs trap focus, support Escape, and restore focus to the trigger. Alert dialogs retain explicit destructive labels.                                          |
| Status, errors, and recovery                  | BROWSER-VERIFIED, CODE-INSPECTED | Polite live regions are atomic; action-required and terminal recovery notices use alerts; routine transfer samples are not live-announced.                             |
| Progress                                      | BROWSER-VERIFIED, CODE-INSPECTED | Determinate progress has a label/value/min/max; indeterminate progress has truthful text and no fabricated number; verified progress is described.                     |
| Colour-independent states                     | CODE-INSPECTED, BROWSER-VERIFIED | Badges, labels, headings, and recovery copy name status without colour alone.                                                                                          |
| Motion                                        | BROWSER-VERIFIED, CODE-INSPECTED | Reduced-motion CSS reduces nonessential animation/transition durations; no flashing completion treatment exists.                                                       |
| Privacy in accessibility content              | CODE-INSPECTED, BROWSER-VERIFIED | Labels and live regions use the existing safe product view models and omit paths, transfer/session IDs, pairing secrets, network detail, raw errors, and P7 filenames. |
| Security regression                           | CODE-INSPECTED, BROWSER-VERIFIED | Keyboard/focus work does not bypass People eligibility, recipient authorization, confirmation, or identity guards.                                                     |

## Assisted Boundaries

| Activity                      | Evidence                         | Result                                                                            |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| Screen-reader semantic review | CODE-INSPECTED, BROWSER-VERIFIED | Roles, names, labels, progress semantics, and live regions were reviewed.         |
| Real NVDA assisted run        | NOT TESTED                       | No assisted NVDA run was available in this environment.                           |
| JAWS                          | NOT TESTED                       | Not available.                                                                    |
| VoiceOver                     | NOT TESTED                       | Not available on the qualified Windows environment.                               |
| Forced-colors/high-contrast   | NOT TESTED                       | The available browser automation did not provide reliable forced-colors evidence. |

## Totals

```text
BLOCKER: 0 found / 0 fixed / 0 remaining
HIGH:    2 found / 2 fixed / 0 remaining
MEDIUM:  3 found / 3 fixed / 0 remaining
LOW:     2 found / 2 fixed / 0 remaining
OBSERVATION: 0 unresolved product defects
```

P9 has no unresolved BLOCKER or HIGH accessibility issue in the audited V1 journeys.
