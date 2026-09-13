# P9 Automated Accessibility Results

## Tooling

| Field            | Result                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Tool             | `@axe-core/playwright` `4.13.0` with `axe-core` `4.13.0`                                     |
| Dependency scope | Root development dependency only; no runtime bundle, service, or network dependency          |
| Browser          | Configured Playwright Chromium channel on Windows                                            |
| Rules            | `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`                                       |
| Result           | 0 critical, 0 serious, 0 moderate, and 0 minor final violations in each scanned stable state |

## Scanned States

| Route or surface     | Stable state                                                                | Result |
| -------------------- | --------------------------------------------------------------------------- | ------ |
| `/send`              | Empty, recipient selected, explicit Light and Dark recipient states, review | PASS   |
| `/receive/[session]` | Authorized review, choose destination, prepared destination                 | PASS   |
| `/send`              | Automatic recovery, completed, terminal integrity failure                   | PASS   |
| `/people`            | Current People surface and Connect dialog                                   | PASS   |
| `/transfers`         | Current Transfers surface                                                   | PASS   |
| `/design-system`     | Shared P3 presentation showcase                                             | PASS   |

Recovery is an active sender state for the scan; completed and terminal states are exercised through the
real engine-backed P4/P5 fixture flow. The scan suite does not force unstable state transitions solely
for scanning.

## Initial Finding And Remediation

The audit first found one serious `color-contrast` rule violation with four nodes in the design-system
showcase. It covered low-confidence health supporting text, error support-reference text, and avatar
text affected by a transfer-card selector. A subsequent full-suite scan caught a second serious
contrast gap during the active primary-button colour transition after recipient selection. P9 corrected
the shared presentation styles and the final scan returned zero violations in each scanned state,
including explicit Light and Dark recipient states.

## Limits

Automated checks are evidence for these rendered states, not proof of full WCAG conformance. They do
not replace real NVDA, JAWS, VoiceOver, forced-colors, or independent Edge assisted testing. No test
result here qualifies Mac or mobile platforms.
