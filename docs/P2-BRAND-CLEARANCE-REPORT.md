# P2 Brand / Domain / Legal Clearance Research Report

## Status

```text
P2 BRAND / DOMAIN / LEGAL CLEARANCE RESEARCH: COMPLETE
P2 PRODUCT BRAND DECISION: CONTINUE_PENDING_COUNSEL
P2 FINAL VERIFICATION: PASS

FORMAL TRADEMARK/LEGAL CLEARANCE:
PENDING WHERE APPLICABLE
```

P2 is research and product-risk assessment, not legal advice. It contains no P3 design work, product UI,
domain acquisition, trademark filing, company formation, or social-account creation.

## Search Date

External research was recorded from `2026-09-10T17:50:29.336+05:00` through
`2026-09-10T17:56:46.976+05:00`. Source-by-source timestamps, queries, platforms, results, and references
are retained in [BRAND-EVIDENCE.json](BRAND-EVIDENCE.json).

## Sources Checked

| Source                            | Result                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| USPTO                             | Exact `FLICKSEND` wordmark: no results; space-separated query was broad and needs review.                                       |
| WIPO Global Brand Database        | `MANUAL REQUIRED`: CAPTCHA blocked a repeatable search.                                                                         |
| EUIPO eSearch plus                | `MANUAL REQUIRED`: official surface reached but no repeatable result captured.                                                  |
| UK IPO                            | `MANUAL REQUIRED`: direct register endpoint access was blocked.                                                                 |
| IPO Pakistan                      | `MANUAL REQUIRED`: no repeatable public trademark result captured.                                                              |
| SECP LEAP                         | Exact `FlickSend` and `Flick Send` company searches: 0 results, with SECP's own non-reservation disclaimer.                     |
| Companies House                   | Active UK `FLICK SEND LOGISTICS LIMITED` is road freight, an unrelated company-name finding.                                    |
| Verisign RDAP and Wayback Machine | `flicksend.com` is registered; archive evidence shows parked/managed pages rather than a recovered product site.                |
| App and developer platforms       | No exact FlickSend listing/object found in limited searches; public Apple `Flick.` file-sharing product is materially relevant. |
| Social routes                     | `NOT VERIFIED`; no route response was treated as handle availability.                                                           |

## Exact-Name And Collision Findings

No exact FlickSend commercial software, app, fintech, or tagline result was identified in the limited
searches. This is not a claim that none exists. The material finding is `Flick.`, a public Apple App Store
file-sharing product by ydangle. It shares the `Flick` root and transfer category, making it a `MEDIUM`
product-risk/counsel-review issue. `FLICK SEND LOGISTICS LIMITED` is an active UK road-freight company and
is assessed `LOW` for category proximity.

## Trademark Findings

The completed exact USPTO `FLICKSEND` Wordmark search returned zero live and zero dead records. The registry
coverage is incomplete: WIPO, EUIPO, UK IPO, and IPO Pakistan need manual or professional completion. P2
identifies Nice classes 009, 038, and 042 as `POSSIBLY_RELEVANT` or `LIKELY_RELEVANT` starting points only;
all class and goods/services decisions are counsel-review work.

## Domain Findings

`flicksend.com` is `REGISTERED`, not available for ordinary registration. It may or may not be acquirable;
P2 makes no price, ownership, or sale assertion. Conditional `flicksend.app` is the preferred future public
candidate if counsel approves the working brand and current registrar checkout confirms it. See
[DOMAIN-STRATEGY.md](DOMAIN-STRATEGY.md).

## Handle And Platform Findings

GitHub, npm, and PyPI showed no public exact namespace at their inspected endpoints; that does not reserve
them. Apple exact search did not identify FlickSend, while its public `Flick.` listing created the important
same-category finding. Google Play, Chrome Web Store, and Microsoft Store discovery queries found no exact
FlickSend result. X, Instagram, LinkedIn, YouTube, TikTok, and Facebook handle status remains `NOT VERIFIED`.

## Brand Score And Risk Assessment

FlickSend scores strongly for product fit (5/5) and memorability (4/5), but weakly for domain strength
(1/5) and search distinctiveness/trademark risk (2/5 each). The compound fits the P1 person-to-person
handoff model, while the shared root is crowded and the descriptive `Send` suffix can blur into messaging
or payments. Full scoring and limitations are in [BRAND-CLEARANCE.md](BRAND-CLEARANCE.md).

## Tagline Assessment

`Send files like messages.` has a clear V1 marketing purpose but is descriptive and unlikely to be a strong
standalone identifier without context. No exact commercial use was identified in the limited exact-phrase
search. That is a discovery result only, not a tagline clearance or rights claim.

## Legal Limitations

- P2 never concludes that FlickSend is legally cleared, safe to register, exclusive, or immune to challenge.
- A no-result query means no match was found in that particular search at that time.
- Domain registration, product use, company registration, trademark rights, and social handles are distinct.
- No private WHOIS information, credentials, or personal registrant data is retained.

## Documents Created Or Updated

- Created [BRAND-CLEARANCE.md](BRAND-CLEARANCE.md).
- Created [TRADEMARK-SEARCH.md](TRADEMARK-SEARCH.md).
- Created [DOMAIN-STRATEGY.md](DOMAIN-STRATEGY.md).
- Created [BRAND-DECISION.md](BRAND-DECISION.md).
- Created [BRAND-EVIDENCE.json](BRAND-EVIDENCE.json).
- Created [ADR 039](adr/039-p2-working-brand-pending-counsel.md).
- Updated [DEFERRED-RISKS.md](DEFERRED-RISKS.md), [ROADMAP.md](ROADMAP.md), and
  [AGENTS.md](../AGENTS.md).

## Repository Verification

P2 changes documentation and a structured evidence artifact only. M7-M10 performance/browser qualification
is not rerun. The required repository commands are recorded with actual results below after execution.

| Command             | Result                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`    | `PASS` - 23/23 Turbo tasks succeeded.                                                              |
| `pnpm lint`         | `PASS` - 13/13 Turbo tasks succeeded with zero warnings allowed.                                   |
| `pnpm test`         | `PASS` - 22/22 Turbo tasks succeeded; 125 Vitest assertions passed.                                |
| `pnpm build`        | `PASS` - 13/13 Turbo tasks succeeded, including Engine Lab production build and signaling dry run. |
| `pnpm format:check` | `PASS` - all matched files use Prettier formatting.                                                |

## Acceptance Matrix

| Requirement                                                       | Result                 |
| ----------------------------------------------------------------- | ---------------------- |
| Exact and similar name research                                   | `PASS WITH LIMITATION` |
| Software/file-transfer and fintech ambiguity research             | `PASS WITH LIMITATION` |
| Priority trademark registries checked or explicitly manual        | `PASS`                 |
| Relevant Nice classes reviewed                                    | `PASS WITH LIMITATION` |
| Exact and alternate domain status investigated                    | `PASS`                 |
| Social, developer, app-store, and business-name checks performed  | `PASS WITH LIMITATION` |
| SEO, linguistic, tagline, scorecard, and risk assessment recorded | `PASS`                 |
| Single recommendation and legal limits recorded                   | `PASS`                 |
| No P3 implementation started                                      | `PASS`                 |
| Repository verification                                           | `PASS`                 |

## Required Human/Counsel Actions

1. Complete WIPO, EUIPO, UK IPO, IPO Pakistan, and launch-market similarity searches for the required
   variants and relevant `FLICK` marks.
2. Evaluate `Flick.` file-sharing use and its rights/status before public use or material brand spending.
3. Recheck and, only if separately authorized, acquire the approved domain through a secure registrar account.
4. Treat all social handles as unverified until a future authorized account-claiming decision.

## Next-Phase Decision

The deferred counsel, registry, domain, and handle actions are outside the P2 research acceptance boundary;
they do not block P2 completion. They do block public legal-clearance claims and should be resolved before a
public launch or material brand commitment.

```text
NEXT PHASE:
P3 — DESIGN SYSTEM
```

P3 has not started.
