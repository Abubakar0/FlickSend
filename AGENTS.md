# FlickSend Engineering Rules

These rules apply to all FlickSend work. Data correctness, reliability, security and privacy,
user trust, performance, resource efficiency, and UI polish are the priority order.

1. `engine-core` must never import React.
2. Engine packages must not depend on Next.js.
3. Normal payload bytes must never pass through the FlickSend application API.
4. Never load an entire user file or folder into memory.
5. Keep buffers bounded.
6. Never Base64-encode bulk payload.
7. Transfer identity is independent of transport identity.
8. Reconnection must not create a new transfer.
9. Verified blocks are not retransmitted without a correctness reason.
10. Never mark `DELIVERED` until integrity verification passes.
11. A hash mismatch is never ignored.
12. Protocol errors are never silently swallowed.
13. Do not log file contents.
14. Do not put filenames or full paths into analytics by default.
15. Validate untrusted manifests, paths, sizes, offsets, and frame fields.
16. Every protocol change must review protocol versioning.
17. Every resume change requires interruption tests.
18. Every performance optimization requires benchmark evidence.
19. Do not weaken correctness or security merely to improve a benchmark.
20. Do not add post-MVP features to Engine Lab without explicit instruction.
21. Keep authentication-provider concerns out of `engine-core`.
22. Keep billing entitlements out of `engine-core`.
23. Do not throttle direct transfers as a pricing mechanism.
24. Document major decisions in `docs/adr/`.
25. If uncertain, prefer an explicit failing transfer over silent incorrect delivery.

## Current Authorized Product Phase

P1 — V1 Product Definition Freeze: COMPLETE
P2 — Brand / Domain / Legal Research: COMPLETE
Brand decision: `CONTINUE_PENDING_COUNSEL`
P3 — Design System: COMPLETE / FROZEN
P4 — Core Send UX: COMPLETE / FROZEN
P5 — Receive UX: COMPLETE / FROZEN
P6 — People & Pairing: COMPLETE / FROZEN
P7 — Transfers: COMPLETE / FROZEN
P8 — Recovery UX: COMPLETE / FROZEN
P9 — Accessibility & UX QA: COMPLETE / FROZEN
P10 — Authentication & Accounts: COMPLETE / FROZEN
P11 — Production Database & Persistence: AUTHORIZED / IN PROGRESS

P12 and all later phases remain NOT AUTHORIZED until P11 is reviewed and accepted.

P9 was limited to an audit and narrow correction pass across the frozen P3-P8 product surfaces only: Send,
Receive, People, Transfers, Recovery, shared presentation primitives, keyboard/focus behavior, semantic
structure, labels, status announcements, contrast, responsive/reflow behavior, reduced motion, copy
clarity, and test-only accessibility automation. P9 must not alter transfer correctness or introduce a
transfer feature, People capability, history capability, recovery algorithm, authentication, persistence,
service infrastructure, telemetry, analytics, billing, marketing, or any P10+ scope. WCAG 2.2 AA is an
implementation target, not a certification claim. Automated checks do not prove full accessibility, and
responsive testing does not qualify a mobile platform, Safari, macOS, or independent Edge browser evidence.

P3 is frozen. It may receive a genuinely missing reusable presentation primitive only when later authorized work
exposes that need; the addition must remain presentation-only, preserve `@flicksend/ui` dependency boundaries, and be
documented in `docs/UI-COMPONENT-INVENTORY.md`. This does not reopen P3 generally.

P4 sender implementation and qualification are frozen. The P4 recipient harness remains development/test
integration infrastructure only; it may support P5 qualification but must not become the P5 product interface.

P5 is frozen. Do not add, redesign, or expand receiver features without explicit authorization for a later phase.
The P5 implementation boundary covered the real recipient route, an application-layer receive
workflow/controller, development authorization/session fixtures, authorized sender identity and bounded transfer
summary, accept/decline, safe browser destination selection and preparation,
waiting/connecting/receiving/verifying/completion presentation, verified progress, Transfer Health, supported
recovery, safe cancellation, product error mapping, accessibility, responsive receive UX, deterministic fixture
destinations for automated qualification, real P4-to-P5 engine integration, and P5 documentation/closeout.

P5 development authorization/session fixtures are NOT PRODUCTION INVITATION SECURITY. Invalid, malformed,
expired, or unauthorized sessions must produce a generic error and reveal no sender identity, filenames,
hierarchy, counts, size, transfer history, or other transfer metadata. P5 must not create public links, fake
accounts, or production authentication. Authorized display metadata must never include a full local source or
destination path.

Product `COMPLETED` requires engine `DELIVERED` for the same active transfer identity; React progress reaching
100% is never sufficient. No payload may begin before a safe destination is prepared. Only the active transfer
identity may update the active recipient UI. Changing destination or session must invalidate stale preparation,
authorization, and engine work. P5 must not duplicate FSTP resume, integrity, StreamPack, route, filesystem
write, or delivery correctness inside React. Mocked progress alone cannot close P5; qualification requires
real engine-backed receiving evidence. Reconnection is nonterminal, cancellation is distinct from failure, and
committed verified blocks are never resent without a correctness reason.

P6 authorizes only the application-layer People relationship flow: an authoritative People controller/reducer and
repository boundary, synthetic fixture identities, a development-only pairing mechanism, and connected-People
recipient sourcing for the existing P4 Send route. P6 must preserve the P4 stale-recipient protections and may not
redesign Send, change transfer correctness, or convert People state into P5 recipient/session authorization.

P6 is frozen. Do not add, redesign, or expand People features without explicit authorization for a later phase.

P6 development People storage is NOT PRODUCTION ACCOUNT/DATABASE PERSISTENCE. Development pairing is NOT
PRODUCTION INVITATION SECURITY. It must use opaque person and invite identities, avoid logging or listing pairing
tokens, remain bounded and single-use where implemented, and use generic invalid-invite errors that disclose no
identity, People graph, or relationship data. People state contains minimal relationship metadata only: never
payload content, transfer metadata/history, filesystem paths, network details, WebRTC details, contact imports, or
analytics. Connected status is only future Send eligibility; it never authorizes payload access. Relationship
changes affect only future People actions and must not silently cancel, corrupt, or otherwise control an active
transfer. FSTP and the existing transfer lifecycle remain the sole transfer-correctness authority.

P7 is frozen. Do not add, redesign, or expand Transfers features without explicit authorization for a later phase.
The completed scope was an observational product Transfers surface: current and recent metadata-only records, opaque
history record routes, authoritative P4/P5 lifecycle recording, safe terminal outcomes, development-only bounded
history storage, People display resolution, eligible Send again navigation, and presentation of prepared M8
SpeedProof summaries. P7 history has no authority over delivery, recovery, integrity, StreamPack, routing,
destination correctness, cancellation, or resume state. A product record may become `COMPLETED` only after engine
`DELIVERED` for the same active transfer identity; React progress reaching 100% is never sufficient.

P7 must not persist payload bytes, filenames, folder names, full source or destination paths, manifests, file trees,
block hashes, engine transfer IDs, signaling/session IDs, browser handles, raw errors, IP/MAC/hostnames, Wi-Fi
identifiers, ICE candidates, SDP, or TURN credentials. Product history may retain only safe metadata and a P6
opaque peer identity. Its development repository must be bounded, must evict oldest non-active records
deterministically, must not use localStorage, sessionStorage, IndexedDB, or OPFS, and is NOT PRODUCTION
DATABASE PERSISTENCE. Production history retention and historical filename persistence are deferred to P15.

P7 did not itself authorize a deep accessibility audit; that later P9 authority is defined above. P10 production
authentication; P11 production database/account work; P12 production invitation/service infrastructure; billing;
marketing; SEO; production TURN deployment; offline delivery; Mesh; Turbo; native application work; global user
discovery; contact harvesting; QR pairing; email delivery; or enterprise/team features. Do not purchase or acquire
a domain, register a trademark or company, create social accounts, make public launch claims, or imply legal
clearance. FlickSend remains an internal working brand pending formal counsel clearance.

P8 is frozen. Its completed scope was application-layer Recovery UX: deterministic recovery presentation and reason
mapping, calm automatic-recovery messaging, action-required and terminal issue composition, verified-progress
explanations, safe retry/start-again actions using existing P4/P5 flows, safe support-detail composition, and P7
recovery-detail presentation. P8 consumes prepared product and engine state. It must not create a RecoveryManager,
resume engine, React block map, resend scheduler, route selector, or any replacement for FSTP recovery, integrity,
StreamPack, route, signaling, destination-write, or delivery correctness. Do not add, redesign, or expand Recovery
UX without explicit authorization for a later phase.

Only engine `DELIVERED` for the same active transfer identity can produce product `COMPLETED`; React progress at
100% can never override a recovery or finalization failure. A recovery view model is presentation-only: it must
not decide that progress is committed, recoverable, verified, or complete. State must remain tied to the active
transfer identity, and a new user-started attempt after terminal failure must use a new identity. Late events from
a failed transfer must never update the new attempt, and P8 must not create duplicate P7 history records across
automatic recovery.

Use `Your verified progress is safe.` only when the prepared engine state proves receiver-committed verified
progress survives the supported current recovery. Do not make that claim for source or destination mutation,
permission loss, explicit cancel, browser reload/restart, or other unqualified interruption. Unknown safety must
remain neutral. Automatic recovery has no manual reconnect/reset action unless an existing safe coordinator API
already exposes one. P8 may never expose verified-block reset, route replacement, candidate, credential, or
protocol controls.

Recovery copy and details must remain product-safe. Do not reveal paths, filenames, manifests, file trees, block
hashes, payload, transfer/session IDs, IP addresses, candidates, SDP, hostnames, TURN credentials, raw engine
codes, stack traces, or raw WebRTC/M8 diagnostics. Safe optional details may contain only prepared route labels,
aggregate reconnect/stall/integrity counts, safe error category, safe support reference, and Transfer Health
explanations. Do not install telemetry, analytics, support submission, auth, persistence, notification, or service
infrastructure for P8.

P8 may change P4 and P5 only for recovery/error composition and correctly delegated existing actions. It must not
redesign Send or Receive, alter People relationships, turn Transfers into a technical console, claim refresh,
restart, background, sleep, or offline continuity without evidence, or silently overwrite a changed destination.
Automatic recovery and restored-status announcements must be concise and announced once; actionable and terminal
issues need text, meaningful headings, predictable focus, and specific accessible action names. P8 qualification
requires real P4/P5 engine-backed recovery evidence; mocked progress or a static error-card collection cannot
close the phase.

P8 does not authorize P10 production authentication; P11 production database;
P12 production signaling/invitation infrastructure; production TURN; billing; marketing; SEO; analytics; offline
delivery; Mesh; Turbo; native work; teams/admin; enterprise features; or any later product phase.

P9 corrections to a genuine P3 presentation primitive were permitted only when they remained presentation-only,
preserved `@flicksend/ui` dependency boundaries, and were recorded in `docs/UI-COMPONENT-INVENTORY.md`. P9 did
not reopen P3 generally. P9 accessibility content must use the same safe product view models as visible
content and must never expose paths, transfer/session IDs, pairing secrets, payload metadata, network
addresses, credentials, raw error codes, or hidden P7 filenames through ARIA, titles, or visually-hidden text.

P10 authorizes only real account authentication and session boundaries behind a narrow application auth adapter.
Clerk is the selected V1 provider. Product pages and controllers must use the provider-independent
`AuthPrincipal`/server auth boundary rather than importing Clerk or trusting a display name, email, query string,
or client state as account authority. Server-side account protection is required for `/send`, `/people`,
`/transfers`, `/transfers/[record]`, and `/account`; `/sign-in`, `/sign-up`, and P5 `/receive/[session]` remain
public according to their own authorization rules. A signed-in account does not authorize recipient payload access,
does not make a People relationship eligible, and does not determine FSTP integrity, recovery, `DELIVERED`, or
transfer identity.

P10 must use provider-supported session handling. Do not implement custom password storage/hashing, email OTP,
OAuth server, session-cookie cryptography, token storage in browser persistence, account enumeration endpoints,
or raw provider error/token/subject UI. Provider subject values may exist only inside the auth adapter and may not
appear in URLs, product history, People data, transfer/session identities, support data, analytics, or normal UI.
Safe local return paths are mandatory. Sign-out must not create a new transfer, change verified progress, or mark a
transfer terminal; leaving a live transfer remains subject to the existing browser navigation warning and does not
claim background continuation.

P10 development identity fixtures are Engine Lab qualification infrastructure only. They require an explicit
non-production switch, are absent in production, and cannot be a production account switcher or an authority for
`?as=`. The P6/P7 process-local repositories remain unavailable outside that fixture boundary. P10 authenticated
principal is NOT a persistent FlickSend database account row: provider-subject-to-account mapping, production
People and Transfers persistence, profiles, and durable account data are deferred to P11. Account/product-data
deletion coordination remains deferred to P15. Do not expose a destructive account deletion control in P10.

P11 authorizes PostgreSQL/Prisma persistence only through the server-side application repository layer. The
`@flicksend/database` package owns the Prisma client, PostgreSQL schema, and committed migrations; React
components, route UI, and engine packages must not issue raw Prisma queries. `engine-core` remains completely
database-independent. Persistent operations resolve the server-side `AuthPrincipal`, provision or resolve one
opaque FlickSend Account, authorize the operation, validate input, execute a bounded repository operation, and
return a safe DTO. Never trust a client-supplied owner account ID, provider subject, email, current user, or history
record as authorization.

PostgreSQL is metadata/control plane only. It must never store payload bytes, chunks, source/destination paths,
filenames, folder names, manifests, file trees, hashes, engine transfer IDs, signaling sessions, browser handles,
ICE/SDP, network identifiers, TURN credentials, raw errors, or provider tokens. Provider subjects remain private
server-side account-mapping data and emails remain unpersisted. Production must never fall back to P6/P7 process
memory when `DATABASE_URL` is missing or unavailable; it must return a generic unavailable state with no raw
database error. P11 does not authorize production pairing or invitation delivery, account deletion, retention,
analytics, observability, billing, or P12+ work. Completed history still requires engine `DELIVERED` for the same
active transfer; automatic recovery uses one application history record; terminal records cannot be reopened by
late events.

No UI primitive may import transfer execution, WebRTC transport, signaling, database, billing, or auth code.
Do not change the frozen V1 scope or implement application-layer payload encryption, Mesh, offline delivery,
or FlickSend Turbo. Keep browser capability detection outside `engine-core`; prefer feature detection over
browser-name blocking; never use Blob accumulation or OPFS as a giant-payload fallback. Route selection must
stay outside FSTP; do not expose TURN shared secrets, candidate addresses, SDP, or credentials through
diagnostics or logs.

M10 records only physical evidence. Same-host results never support network-throughput or utilization
claims. Retained performance artifacts must exclude hostnames, usernames, IP/MAC addresses, Wi-Fi
names, filesystem paths, filenames, transfer IDs, payload bytes, and credentials. Never relabel an
unavailable baseline or an invalid run as PASS. M9 real external Windows filesystem/picker evidence
remains DEFERRED / ACCEPTED PRODUCT RISK and must not promise
offline delivery, background transfers, browser-restart persistence, Mac/mobile support, physical speed
or utilization, production TURN, or application-layer payload encryption without later evidence.
