# P9 Contrast Review

## Method

Ratios below were calculated programmatically from the final CSS token hex values using the WCAG relative
luminance formula. Axe `color-contrast` scans were then run on the representative rendered states in
light/system theme. Text targets are at least `4.5:1`; focus-ring results are reviewed against the
non-text `3:1` target.

## Measured Pairs

| Theme | Foreground / background |   Ratio | Use                                         |
| ----- | ----------------------- | ------: | ------------------------------------------- |
| Light | `#16211d` / `#ffffff`   | 16.54:1 | Primary text on surface                     |
| Light | `#52605a` / `#ffffff`   |  6.60:1 | Secondary text on surface                   |
| Light | `#617067` / `#ffffff`   |  5.22:1 | Muted text on surface                       |
| Light | `#08786f` / `#ffffff`   |  5.35:1 | Accent text/link and primary action pairing |
| Light | `#47554c` / `#dce4de`   |  6.06:1 | Disabled control text                       |
| Light | `#52605a` / `#f9edcf`   |  5.67:1 | Warning health supporting/confidence text   |
| Light | `#52605a` / `#f9e4e1`   |  5.41:1 | Error support-reference text                |
| Light | `#1b9a8d` / `#f5f7f4`   |  3.22:1 | Visible focus ring                          |
| Dark  | `#edf4ef` / `#19221e`   | 14.58:1 | Primary text on surface                     |
| Dark  | `#b9c7be` / `#19221e`   |  9.29:1 | Secondary text on surface                   |
| Dark  | `#91a198` / `#19221e`   |  6.02:1 | Muted text on surface                       |
| Dark  | `#55c6b7` / `#19221e`   |  7.87:1 | Accent text/link                            |
| Dark  | `#c7d4cb` / `#314039`   |  7.13:1 | Disabled control text                       |
| Dark  | `#b9c7be` / `#473817`   |  6.49:1 | Warning health supporting/confidence text   |
| Dark  | `#b9c7be` / `#4e2723`   |  7.31:1 | Error support-reference text                |
| Dark  | `#8bdcd1` / `#121816`   | 11.35:1 | Visible focus ring                          |

## Notes

Status, route, and presence are represented with text and semantic labels in addition to colour.
Low-confidence Transfer Health now uses a dashed border rather than reducing the opacity of its content,
which preserves contrast without implying a stronger diagnosis. Disabled controls use solid reviewed tokens
rather than opacity blending, remain visibly disabled, and are not presented as unexplained active actions.

The review is limited to the current design tokens and audited rendered states. Forced-colors/high-
contrast browser evidence is `NOT TESTED`.
