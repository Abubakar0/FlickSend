# Brand Tokens

## Working-Brand Boundary

FlickSend is a working product identity under the P2 decision `CONTINUE_PENDING_COUNSEL`. Every P3 asset
must be treated as **WORKING BRAND ASSET — NOT FINAL LEGAL-CLEARED IDENTITY**. P3 neither buys domains nor
creates social accounts, filings, marketing, or final trademark-dependent artwork.

## Single Source Of Truth

`@flicksend/shared` exports `workingBrand`. `@flicksend/ui` re-exports it for presentation use. It holds:

| Token                   | Current value                           | Safe future change                                              |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `name`                  | `FlickSend`                             | Yes; app metadata and UI consumers read this object.            |
| `shortName`             | `FlickSend`                             | Yes.                                                            |
| `tagline`               | `Send files like messages.`             | Yes; no component layout assumes its exact text.                |
| `wordmark`              | `FlickSend`                             | Yes; `BrandMark` reads this field from the brand object.        |
| `symbol`                | `flicksend-working-symbol`              | Yes; `BrandMark` consumes this symbol reference.                |
| `favicon`               | `/icon.svg`                             | Yes; Engine Lab metadata reads this one reference.              |
| `accentToken`           | `accent`                                | Yes; all component color references are semantic CSS variables. |
| `assetStatus`           | `WORKING_BRAND_PENDING_LEGAL_CLEARANCE` | Update only after the appropriate legal/business decision.      |
| `futureMarketingAssets` | `DEFERRED`                              | Remains deferred outside P3.                                    |

The semantic accent variables live in `packages/ui/src/styles.css`: `--fs-accent`,
`--fs-accent-hover`, `--fs-accent-active`, `--fs-accent-soft`, and `--fs-on-accent`. Replacing those values
changes the visual brand accent in both themes without searching individual components.

All entries in the table are **working**, **replaceable**, and **not legally cleared**. The local
`apps/engine-lab/app/icon.svg` is a neutral working symbol that fulfills the current favicon reference; it
does not create a final logo, trademark claim, or marketing asset. Future marketing assets remain explicitly
`DEFERRED` in the brand object.

## Verification

P3 searched reusable `@flicksend/ui` source for hard-coded working-brand name, tagline, favicon path, and
hex color literals. Product-name copy is derived from `workingBrand.shortName`; brand hex values exist only
in the semantic token source, not in component TSX. The Engine Lab fixture may use the working name in
synthetic explanatory copy. Changing the working brand therefore does not require component-by-component
edits.

## Deliberate Limits

- The current mark is a simple neutral symbol plus wordmark, not a permanent logo program.
- There are no external fonts, marketing illustrations, social assets, final favicon artwork, or logo
  variations in P3.
- Product brand, legal entity, domain, trademark registration, and marketing identity remain separate
  decisions as established in [BRAND-DECISION.md](BRAND-DECISION.md).
