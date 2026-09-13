# P10 Authentication And Accounts Implementation Report

## Status

```text
P10 AUTHENTICATION & ACCOUNTS: COMPLETE
P10 FINAL VERIFICATION: PASS
P10 LIVE AUTH PROVIDER QUALIFICATION: PASS
AUTHENTICATION EXPERIENCE: FROZEN
```

The deterministic implementation, retained P4-P9 browser regression, and real Clerk development qualification are
green. The real-provider case demonstrated sign-in, an authenticated session, protected access, sign-out, and
post-sign-out denial. This qualification does not create a P11 database, production invitation infrastructure, or
production deployment evidence.

## Live Qualification Environment

On September 14, 2026, the Engine Lab was linked to its configured Clerk development instance through the Clerk CLI.
The development keys remain only in the app-local ignored environment file. Values were never read, printed,
committed, or included in test evidence. `clerk doctor` passed against the linked development instance.

The dedicated `pnpm test:e2e:clerk` configuration loads that app-local environment, starts the provider-mode Engine
Lab and its existing local signaling dependency, and disables the development-auth fixture. Its setup obtains a
Clerk testing token. The qualification creates one opaque temporary Clerk test user, signs in through Clerk, exercises
the routes below, deletes that user in `finally`, and verifies that no temporary test user remains. The test does not
retain passwords, OTPs, tokens, session cookies, provider subjects, email addresses, or keys.

## Route Matrix And AGENTS Verification

[P10-AUTH-ROUTE-MATRIX.md](P10-AUTH-ROUTE-MATRIX.md) was reviewed against the implemented server boundary. It
preserves public P5 Receive authorization and makes no P11 ownership claim. `AGENTS.md` now records `P10 —
Authentication & Accounts: COMPLETE / FROZEN`; P11 and every later phase remain not authorized.

## Objective And Provider Choice

P10 adds an ordinary account/session model for sender-side routes without granting payload access, redefining
transfer authority, or beginning P11 persistence. Clerk `7.9.2` is used through the official Next.js integration;
the selected release was verified against Next `16.3.4`, React `19.2.8`, and Node `24` before installation.

No P11 database model, Prisma schema, PostgreSQL account table, persistent People, persistent transfer history,
custom passwords, custom OTP, custom OAuth, custom session cryptography, billing, organization, or deletion feature
was introduced.

## Auth Architecture And Principal Model

`apps/engine-lab/app/auth` is the sole application auth boundary. It owns provider configuration checks,
server-side optional/required principal resolution, safe local return paths, current-account presentation context,
auth UI adaptation, and sign-out UI adaptation. Product routes and P4-P8 controllers do not import Clerk directly.

`AuthPrincipal.principalId` is the only account authority. Display name and email are presentation fields only;
email is marked verified only if the provider supplies verified state. The raw Clerk subject is confined to the
adapter and is not placed in normal UI, URLs, transfer data, People data, support references, or analytics.

## Routes, Receive, And Product Boundaries

The server guards `/send`, `/people`, `/transfers`, `/transfers/[record]`, and `/account` before rendering their
protected product UI. Signed-out requests receive `/sign-in` with an allowlisted local return path. `/sign-in`,
`/sign-up`, and `/receive/[session]` remain public.

Guest Receive remains P5 session-authorized. A signed-in account and a P6 connected relationship do not authorize a
recipient to receive payload. The P10 browser suite confirms an invalid guest session remains generic even with a
development fixture identity. Authentication does not affect FSTP, StreamPack, integrity, recovery, transfer ID,
verified progress, or `DELIVERED`.

P10 does not pretend an authenticated account creates persistent People or history. In a configured production
environment, data-dependent Send, People, and Transfers areas truthfully remain unavailable until P11/P12 rather
than falling back to process-local development data. P10 authenticated principal is not a persistent FlickSend
database account row; subject-to-account mapping is deferred to P11.

## Sign-In, Sign-Up, Account, And Sign-Out

Configured environments render Clerk's supported sign-in/sign-up components. Account is deliberately constrained:
safe own display name, own primary email where present, verified wording only where reported, and Sign out. It does
not expose provider identifiers, tokens, session diagnostics, organizations, roles, billing, or destructive account
deletion.

Session expiry/revocation resolves to the same safe signed-out route behavior. Sign-out has no engine or controller
authority and cannot create a transfer, replace its identity, reset verified progress, or mark a transfer terminal.
Existing active-transfer `beforeunload` protection remains when leaving the transfer page; no background-transfer
continuity is claimed.

## Development Fixture Boundary

The P6/P7 synthetic identity adapter requires `FLICKSEND_DEVELOPMENT_AUTH_FIXTURE=1` in a non-production process.
Playwright supplies this environment only to its Engine Lab/signaling qualification servers. The fixture is visibly
labelled `P10 DEVELOPMENT AUTH FIXTURE NOT PRODUCTION AUTHENTICATION`; it is not a production account switcher and
it cannot run with `NODE_ENV=production`. Production ignores `?as=` selection. P6/P7 development APIs share the
same explicit gate.

## Security, Privacy, Accessibility, And Responsive Behavior

The security review is retained in [P10-SECURITY-REVIEW.md](P10-SECURITY-REVIEW.md). It records passing server
guard, open-redirect, fixture isolation, provider-ID/token/error exposure, guest Receive, People eligibility,
history privacy, sign-out, and active-transfer-isolation boundaries. P10 persists no auth token, provider secret,
payload, filename, path, transfer/session identity, People graph, transfer history, or product account record.

P10 retains the P9 WCAG 2.2 AA implementation target. Targeted Chromium evidence checks keyboard-named controls and
zero axe violations for deterministic sign-in/sign-up fixture and Account states. These results do not claim live
provider form accessibility, certification, screen-reader, mobile, Safari, macOS, or independent Edge evidence.

## Live Clerk Qualification

The dedicated provider-mode Playwright case passed in a real Clerk development instance. It verified:

```text
Clerk test-token setup
real Clerk sign-in and authenticated session
authenticated /send and /people rendering
public generic invalid /receive/[session] behavior while signed in and signed out
external returnTo rejection to /send
real Clerk sign-out
post-sign-out server redirects from /send and /account to safe sign-in routes
temporary test-user deletion and cleanup verification
```

Result: one live provider qualification scenario passed, plus its Clerk test-token setup; zero failed. The default
browser suite remains fixture-mode by design and does not load development provider keys.

## Tests And P4-P9 Regression

P10-specific deterministic evidence: 5 configured, 5 passed, 0 skipped, 0 failed. It covers server-side
protected-route redirects, safe return paths, external redirect rejection,
fixture sign-out/post-sign-out protection, public invalid guest Receive, signed-in invalid Receive isolation, account
semantics, and axe scans.

The full fixture-mode Playwright suite completed with 89 configured, 71 passed, 18 skipped, and 0 failed. The 18
skips are pre-existing environment-gated physical/long-run qualification cases. No P10-critical deterministic or
dedicated live-provider case is skipped.

| Retained product suite | Configured | Passed | Skipped | Failed |
| ---------------------- | ---------: | -----: | ------: | -----: |
| P4 Send                |          7 |      7 |       0 |      0 |
| P5 Receive             |         10 |     10 |       0 |      0 |
| P6 People              |          6 |      6 |       0 |      0 |
| P7 Transfers           |          7 |      7 |       0 |      0 |
| P8 Recovery            |         12 |     12 |       0 |      0 |
| P9 accessibility       |          7 |      7 |       0 |      0 |
| P10 deterministic auth |          5 |      5 |       0 |      0 |
| P10 live Clerk         |          1 |      1 |       0 |      0 |

## Engine Qualification Decision

No engine package or transfer-correctness runtime changed in P10.

```text
M4-M10 DEDICATED QUALIFICATION: NOT RERUN — NO ENGINE CORRECTNESS CHANGE
```

The normal repository suite re-exercised retained engine and product regressions. P10 must not be interpreted as
new physical-network, platform, picker, TURN, or performance evidence.

## Repository Verification

| Command               | Actual result                                                   |
| --------------------- | --------------------------------------------------------------- |
| `pnpm typecheck`      | PASS — 25/25 Turbo tasks                                        |
| `pnpm lint`           | PASS — 14/14 Turbo tasks                                        |
| `pnpm test`           | PASS — 25/25 Turbo tasks; 205 unit tests passed                 |
| `pnpm test:e2e`       | PASS — 89 configured; 71 passed; 18 skipped; 0 failed           |
| `pnpm test:e2e:clerk` | PASS — 1 live provider scenario plus test-token setup; 0 failed |
| `pnpm build`          | PASS — 14/14 Turbo tasks; Engine Lab production build completed |
| `pnpm format:check`   | PASS — all matched files use Prettier style                     |

The production build deliberately succeeds without Clerk secrets. At runtime an account-owned route without complete
Clerk configuration renders safe unavailable account access rather than enabling synthetic authentication.

## Acceptance Matrix

| Requirement                                                                   | Result                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AGENTS P10 boundary updated                                                   | PASS                                                                        |
| Clerk integration / provider boundary / `AuthPrincipal`                       | PASS                                                                        |
| Provider IDs hidden; email/display name not authority                         | PASS                                                                        |
| `/sign-in`, `/sign-up`, `/account` implementation                             | PASS, including live-provider qualification                                 |
| Protected `/send`, `/people`, `/transfers`, `/transfers/[record]`, `/account` | PASS                                                                        |
| Guest `/receive/[session]` remains public                                     | PASS                                                                        |
| Signed-in invalid Receive remains unauthorized                                | PASS                                                                        |
| Safe return path and open-redirect rejection                                  | PASS                                                                        |
| Production `?as=` impersonation blocked                                       | PASS                                                                        |
| Development fixture isolated                                                  | PASS                                                                        |
| Sign-out route behavior                                                       | PASS, including real provider sign-out                                      |
| Session expiry / revocation safe boundary                                     | PASS by provider-supported server boundary; not independently injected live |
| Active-transfer isolation / navigation protection                             | PASS by engine/UI boundary inspection and retained P4 regression            |
| People eligibility and history privacy preserved                              | PASS                                                                        |
| Accessibility / responsive deterministic evidence                             | PASS                                                                        |
| Security and privacy review                                                   | PASS                                                                        |
| P4-P9 regression                                                              | PASS                                                                        |
| Live Clerk development/test qualification                                     | PASS                                                                        |
| No P11+ scope creep                                                           | PASS                                                                        |
| Repository verification                                                       | PASS                                                                        |

## Known Limitations And Deferred Work

- Production account database mapping, durable Profiles/People/Transfers: P11.
- Production invitation/signaling infrastructure: P12.
- Account/product-data deletion coordination: P15.
- Production Clerk instance configuration and deployment verification remain deferred.
- Production TURN, physical network evidence, offline delivery, Mesh, Turbo, native applications, billing, teams,
  analytics, marketing, and SEO: unchanged deferred scope.

## Next Phase

```text
P11 — PRODUCTION DATABASE & PERSISTENCE: NOT AUTHORIZED
```

Do not start P11 until P10 receives external review.
