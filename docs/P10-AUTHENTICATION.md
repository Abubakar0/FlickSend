# P10 Authentication And Accounts

## Purpose

P10 introduces real account/session boundaries for account-owned sender product routes. It does not introduce a
FlickSend application database, persistent People, persistent Transfers, billing identity, organizations, or
product-data deletion.

## Provider And Boundary

Clerk is the selected V1 authentication provider. All provider-specific integration lives under
`apps/engine-lab/app/auth`:

- `AuthPrincipal` carries an authoritative `principalId` plus presentation-only display name, primary email, and
  verified-email state.
- `getOptionalAuthenticatedPrincipal()` supports guest-capable routes without granting access.
- `requireAuthenticatedPrincipal()` resolves server authority and redirects signed-out account requests safely.
- `CurrentAccountProvider` is presentation-only. It does not authorize transport, transfer, People, or history.

Display name and email are never account authority. Clerk subjects stay inside the adapter and are not exposed in
normal product UI, URLs, history, People data, support references, or transfer/session identifiers.

## Routes And Authority

`/send`, `/people`, `/transfers`, `/transfers/[record]`, and `/account` require an authenticated account before
their product UI renders. `/sign-in` and `/sign-up` are public provider routes. `/receive/[session]` remains public:
the existing P5 transfer session authorization decides whether a guest may review or receive a transfer.

Signed in does not mean authorized to receive. A connected Person does not mean authorized to receive payload.
Authentication never determines FSTP integrity, verified progress, recovery, transfer identity, or `DELIVERED`.

Return destinations are restricted to allowed local account-owned paths. External, scheme-based, and protocol-
relative values fall back to `/send`.

## Sign-In, Sign-Up, Account, And Sign-Out

Configured Clerk environments use Clerk's supported sign-in/sign-up UI and session flow. The restrained Account
surface displays only safe own-account presentation data and provides Sign out. It does not expose raw provider IDs,
tokens, session metadata, account deletion, roles, organizations, or billing controls. An email is labelled
verified only when Clerk reports that state.

Provider session expiry/revocation is treated as signed out for protected requests with safe Sign in copy. Provider
details, token validation information, and raw error objects are never displayed. Signing out does not fail,
complete, replace, or reset an already active transfer. Leaving an active page continues to use the existing browser
navigation warning; FlickSend makes no background-transfer claim.

## Development Fixture Boundary

`FLICKSEND_DEVELOPMENT_AUTH_FIXTURE=1` enables deterministic synthetic identities only in a non-production Engine
Lab process. It is used by automated qualification and is explicitly labelled `P10 DEVELOPMENT AUTH IDENTITY
FIXTURE NOT PRODUCTION AUTHENTICATION`. It is unavailable when `NODE_ENV=production`; production never accepts
`?as=` as account authority. The P6/P7 process-local fixture APIs are also unavailable unless this test switch is
enabled.

## P6/P7 Transition And P11 Boundary

P6 synthetic People and P7 development history remain test infrastructure, not account data. Signing in does not
invent a connected People graph or durable transfer history. Until P11 provides an approved persistence design,
authenticated production routes truthfully show that these data-dependent areas are unavailable.

P10 AUTHENTICATED PRINCIPAL IS NOT YET A PERSISTENT FLICKSEND DATABASE ACCOUNT ROW. The future mapping is:

```text
Clerk provider subject
        ↓ P11
FlickSend persistent account ID
```

Account/product-data deletion coordination is deferred to P15.

## Security, Privacy, Accessibility

Clerk owns standard provider session, callback, CSRF/state, and token handling. FlickSend does not persist auth
tokens in localStorage, sessionStorage, IndexedDB, or OPFS. P10 adds no payload, filename, folder name, path,
transfer/session ID, People graph, history, or provider-secret persistence.

The P9 WCAG 2.2 AA implementation target applies to Sign in, Sign up, Account, redirects, and sign-out. Targeted
browser checks cover named keyboard-reachable controls and axe scans of deterministic fixture Account/entry states.
Provider-hosted/component form details require live provider qualification before any broader accessibility claim.

## Live Development Qualification

P10 real-provider qualification passed against the configured Clerk development instance. It verified real sign-in,
authenticated protected-route access, safe external return-path rejection, sign-out, and post-sign-out server denial
using a temporary test user that was deleted after the run. This is development-instance evidence only; it does not
qualify production deployment, P11 persistence, or provider-hosted form accessibility beyond the exercised flow.
