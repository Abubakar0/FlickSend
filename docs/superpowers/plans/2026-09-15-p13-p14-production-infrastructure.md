# P13/P14 Production Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productionize the P12 signaling control plane and M7 TURN fallback without changing transfer-engine correctness, while truthfully retaining external infrastructure qualification as blocked until provider access exists.

**Architecture:** `@flicksend/config` becomes a framework-independent, secret-value-free contract shared by the Railway application and Cloudflare Worker. P13 extends the existing Worker/DO with environment separation, safe operations, and a server-only relay-eligibility check. P14 adds a Railway-only TURN credential issuer and a prepared client ICE adapter; coturn remains an independently deployed relay and never participates in FSTP or application persistence.

**Tech Stack:** TypeScript 6, pnpm workspaces, Next.js route handlers, Cloudflare Workers/Durable Objects/Wrangler, coturn Docker Compose, Vitest, Playwright, Node qualification runners.

**Spec:** `docs/superpowers/specs/2026-09-15-p13-p14-production-infrastructure-design.md`

## Global Constraints

- Preserve every M0-M10 and P1-P12 invariant; do not change FSTP, integrity, StreamPack, recovery, `DELIVERED`, or transfer identity.
- `engine-core` remains independent of React, Next.js, authentication, database, infrastructure, and coturn code.
- The application API, Cloudflare Worker, and PostgreSQL must never carry normal payload bytes or persist signaling/TURN secrets, capabilities, ICE/SDP, paths, filenames, manifests, IDs, or network metadata.
- Environments are exactly `development`, `staging`, or `production`; there is no production fallback to a lower environment.
- Staging and production have different signaling secrets, Durable Object namespaces, Worker names, and TURN secrets. Signaling and TURN secrets are independent.
- Railway owns application/API and PostgreSQL; Cloudflare owns signaling only; a dedicated public host owns coturn only.
- Default TURN credential TTL is 1,800 seconds, bounded inclusively to 600-3,600 seconds.
- Do not add a database table, Prisma migration, billing, analytics, retention, account deletion, application-layer encryption, offline delivery, Mesh, Turbo, native work, or P15+ behavior.
- External qualification is `BLOCKED`, never `PASS`, until persistent Cloudflare staging and a public coturn host with real clients are supplied.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `packages/config/src/index.ts` | Pure configuration types, exact environment parsing, credential-free URL/origin/ICE validation, and DTO validators. |
| `packages/config/test/environment-contract.test.ts` | Deterministic contract validation and secret/public-boundary tests. |
| `apps/signaling/src/environment.ts` | Worker-only environment resolver and safe operation request authentication. |
| `apps/signaling/src/operations.ts` | Health, origin/method/path checks, bounded rate controls, and relay-eligibility response composition. |
| `apps/signaling/src/production-signaling.ts` | Room-level bounded eligibility query without returning room/socket metadata. |
| `apps/engine-lab/app/signaling/capabilities.server.ts` | Server-only P12 capability minting and verification; shared-signature request creation. |
| `apps/engine-lab/app/signaling/turn-credentials.server.ts` | Railway-only relay eligibility client, TTL/rate checks, coturn REST credential generation, and safe DTO composition. |
| `apps/engine-lab/app/api/persistence/signaling/turn-credentials/route.ts` | Bounded application route that resolves safe caller context and returns a safe category/ICE DTO. |
| `apps/engine-lab/app/signaling/turn-client.ts` | Browser ICE provider consuming only a prepared P14 DTO. |
| `infra/turn/*` | Sanitized public coturn Docker/config/environment/firewall templates, never credentials. |
| `tests/p13/*`, `tests/p14/*`, `tests/p13-p14/*` | Deterministic local and explicit external-blocked qualification runners. |
| `docs/P13-*.md`, `docs/P14-*.md`, `docs/P13-P14-INTEGRATION-REPORT.md` | Operations, security, deployment, qualification, and truthful closeout evidence. |

### Task 1: Establish P13/P14 Authority And Pure Configuration Contract

**Files:**
- Modify: `AGENTS.md`, `packages/config/README.md`, `pnpm-lock.yaml`
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/index.ts`, `packages/config/test/environment-contract.test.ts`
- Modify: `apps/signaling/package.json`, `apps/engine-lab/package.json`

**Interfaces:**
- Produces `FlickSendEnvironment`, `parseEnvironmentClass`, `parsePublicWorkerUrl`, `parseExpectedOrigins`, `parseIceUrls`, `parseTurnCredentialTtl`, and `ClientIceConfiguration` from `@flicksend/config`.
- `ClientIceConfiguration` has exactly `stunUrls`, `turnUrls`, `username`, `credential`, and `expiresAtMs`.

- [ ] **Step 1: Write failing pure-package tests.**

```ts
expect(parseEnvironmentClass("staging")).toBe("staging");
expect(parseEnvironmentClass("preview")).toBeNull();
expect(parsePublicWorkerUrl("https://worker.example")).toBeNull();
expect(parseExpectedOrigins("https://app.example,https://app.example")).toBeNull();
expect(parseTurnCredentialTtl("1800")).toBe(1800);
expect(parseTurnCredentialTtl("59")).toBeNull();
```

- [ ] **Step 2: Run the focused test and confirm it fails because the package exports do not exist.**

Run: `pnpm --filter @flicksend/config exec vitest run test/environment-contract.test.ts`

Expected: failure that `@flicksend/config` or the tested exports are unavailable.

- [ ] **Step 3: Implement the package with no Node, React, Next.js, Worker, or secret dependencies.**

```ts
export type FlickSendEnvironment = "development" | "staging" | "production";
export type ClientIceConfiguration = Readonly<{
  stunUrls: readonly string[];
  turnUrls: readonly string[];
  username: string;
  credential: string;
  expiresAtMs: number;
}>;
```

Use credential-free `wss:` parsing for public Worker URLs, exact HTTPS origin parsing without `*`, max-eight ICE URL lists, 512-character URL/value bounds, and a 600-3,600 second TTL range. Do not add any environment loader that could accidentally bundle secrets.

- [ ] **Step 4: Update phase authority and package dependencies.**

Replace the stale P12 review gate in `AGENTS.md` with:

```text
P1-P12: COMPLETE / FROZEN
P13 — Production Signaling Deployment & Operations: AUTHORIZED / IN PROGRESS
P14 — Production TURN & Relay Infrastructure: AUTHORIZED / IN PROGRESS
P15 and later: NOT AUTHORIZED
```

Preserve every existing invariant. Make `@flicksend/config` a direct dependency of only `@flicksend/signaling` and `@flicksend/engine-lab`.

- [ ] **Step 5: Run focused verification and commit.**

Run: `pnpm --filter @flicksend/config test && pnpm --filter @flicksend/config typecheck`

Expected: PASS.

```bash
git add AGENTS.md packages/config apps/signaling/package.json apps/engine-lab/package.json pnpm-lock.yaml
git commit -m "feat: add p13 p14 environment contract"
```

### Task 2: Define Isolated Cloudflare Environments And Worker Configuration

**Files:**
- Modify: `apps/signaling/wrangler.jsonc`, `apps/signaling/src/index.ts`, `apps/signaling/src/production-signaling.test.ts`
- Create: `apps/signaling/src/environment.ts`, `apps/signaling/src/environment.test.ts`

**Interfaces:**
- Produces `resolveWorkerEnvironment(env): WorkerEnvironmentConfig | null`.
- `WorkerEnvironmentConfig` contains validated environment class, expected origins, safe version, and required signaling secret only; it never returns a secret to a response.

- [ ] **Step 1: Write failing environment configuration tests.**

```ts
expect(resolveWorkerEnvironment({ ENVIRONMENT: "staging", SIGNALING_CAPABILITY_SECRET: secret })).toMatchObject({
  environment: "staging"
});
expect(resolveWorkerEnvironment({ ENVIRONMENT: "production", SIGNALING_CAPABILITY_SECRET: "short" })).toBeNull();
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `pnpm --filter @flicksend/signaling exec vitest run src/environment.test.ts`

Expected: failure because the resolver is absent.

- [ ] **Step 3: Add explicit Wrangler environments and runtime validation.**

Define `development`, `staging`, and `production` named environments with distinct Worker names, explicit `SESSION_DIRECTORY`, `SESSION_ROOM`, and `PRODUCTION_SESSION_ROOM` Durable Object bindings, exact `ENVIRONMENT` values, expected-origin variables, and required `SIGNALING_CAPABILITY_SECRET`. Keep values non-sensitive; configure actual secret values only through Wrangler provider secrets. Ensure development, staging, and production DO migrations are explicit and cannot share a namespace accidentally.

```ts
export function resolveWorkerEnvironment(env: Env): WorkerEnvironmentConfig | null {
  const environment = parseEnvironmentClass(env.ENVIRONMENT);
  const origins = parseExpectedOrigins(env.EXPECTED_ORIGINS);
  if (!environment || !origins || !hasMinimumSecret(env.SIGNALING_CAPABILITY_SECRET)) return null;
  return { environment, expectedOrigins: origins, version: safeBuildVersion(env.BUILD_VERSION) };
}
```

- [ ] **Step 4: Retain P12 capability and Durable Object behavior.**

Add only configuration guards around existing `fsst1` admission. Do not change capability fields, DO hibernation attachments, peer limit, relay message schema, or transfer identity behavior.

- [ ] **Step 5: Run Worker checks and commit.**

Run: `pnpm --filter @flicksend/signaling typecheck && pnpm --filter @flicksend/signaling test && pnpm --filter @flicksend/signaling build`

Expected: PASS, including Wrangler dry-run.

```bash
git add apps/signaling
git commit -m "feat: isolate p13 signaling environments"
```

### Task 3: Add P13 Safe Worker Operations And Room Eligibility

**Files:**
- Create: `apps/signaling/src/operations.ts`, `apps/signaling/src/operations.test.ts`
- Modify: `apps/signaling/src/index.ts`, `apps/signaling/src/production-signaling.ts`, `apps/signaling/src/production-signaling.test.ts`

**Interfaces:**
- Produces `createHealthResponse(config)`, `validateBrowserOrigin(request, config)`, `verifyRelayEligibilityRequest(request, secret)`, and `ProductionSessionRoom.relayEligibility(...)`.
- `relayEligibility` returns only `{ eligible: boolean; category: "ELIGIBLE" | "UNAVAILABLE" | "REJECTED" }`.

- [ ] **Step 1: Write failing tests for safe HTTP and room operations.**

```ts
expect(await healthResponse({ environment: "staging", version: "build-123" }).json()).toEqual({
  status: "ok", environment: "staging", version: "build-123"
});
expect(validateBrowserOrigin(new Request("https://worker/v2/session", { headers: { Origin: "https://evil.test" } }), config)).toBe(false);
expect(await room.relayEligibility({ role: "sender", expiresAtMs })).toEqual({ eligible: true, category: "ELIGIBLE" });
```

- [ ] **Step 2: Run the focused tests and confirm they fail.**

Run: `pnpm --filter @flicksend/signaling exec vitest run src/operations.test.ts src/production-signaling.test.ts`

Expected: failures for missing operations and room method.

- [ ] **Step 3: Implement safe health, origin/method/path rules, and bounded controls.**

`GET /health` must not obtain a DO stub. Browser-originated `OPTIONS`, session join, and revoke requests require an exact configured origin. Reject unknown path/method, malformed/oversize frames, invalid role/version, expired/tampered capability, and excess bounded rates using generic codes. Use short-lived in-memory/DO counters with deterministic expiry; never create an unbounded global identity store.

- [ ] **Step 4: Implement server-only relay eligibility.**

Require `POST /v2/relay-eligibility`, a bearer `fsst1` capability, and an HMAC request proof computed by Railway from the capability, timestamp, and `SIGNALING_CAPABILITY_SECRET`. Verify a tight timestamp window, capability signature, role, expiry, and DO revocation state. Strip raw capability/proof before DO routing. Return only the safe three-state response and reject browser calls lacking the HMAC proof.

- [ ] **Step 5: Run Worker tests and commit.**

Run: `pnpm --filter @flicksend/signaling test`

Expected: PASS for health privacy, origins, rate bounds, revocation, expiry, reconnect, and eligibility output.

```bash
git add apps/signaling/src
git commit -m "feat: add p13 signaling operations"
```

### Task 4: Add Railway P12 Verification And P14 Credential Issuer

**Files:**
- Modify: `apps/engine-lab/app/signaling/capabilities.server.ts`, `apps/engine-lab/app/signaling/session-service.ts`
- Create: `apps/engine-lab/app/signaling/turn-credentials.server.ts`, `apps/engine-lab/app/signaling/turn-credentials.server.test.ts`, `apps/engine-lab/app/api/persistence/signaling/turn-credentials/route.ts`

**Interfaces:**
- Produces `verifyIssuedSignalingCapability(raw): VerifiedSignalingCapability | null`, `createRelayEligibilityProof(...)`, and `TurnCredentialService.issue(input): Promise<ClientIceConfiguration>`.
- `VerifiedSignalingCapability` contains only `role`, `sessionId`, `expiresAtMs`, and opaque token ID internally; it is never serialized to product UI.

- [ ] **Step 1: Write failing server tests.**

```ts
await expect(service.issue({ capability: revokedReceiverCapability })).rejects.toMatchObject({ code: "FS_TURN_AUTH_FAILED" });
const dto = await service.issue({ capability: senderCapability });
expect(dto).toEqual(expect.objectContaining({ expiresAtMs: expect.any(Number) }));
expect(JSON.stringify(dto)).not.toContain(turnSharedSecret);
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `pnpm --filter @flicksend/engine-lab exec vitest run app/signaling/turn-credentials.server.test.ts`

Expected: failure because the P14 service and server verifier do not exist.

- [ ] **Step 3: Implement server-only validation and REST credential generation.**

Verify the existing `fsst1` HMAC/claims server-side using the Railway signaling secret. Call only the configured Cloudflare HTTP relay-eligibility endpoint with the signed server proof. Parse exactly the safe response. Use coturn REST credentials:

```ts
const username = `${Math.floor(nowMs / 1000) + ttlSeconds}:${opaqueParticipantId}`;
const credential = createHmac("sha1", turnSharedSecret).update(username, "utf8").digest("base64");
```

The 30-minute default and 10-60 minute bounds come from `@flicksend/config`. No token, secret, claim, account ID, or remote error enters logs, responses, or persistence.

- [ ] **Step 4: Add the bounded API route.**

Read at most 2 KiB JSON containing only a capability and optional renewal request. Ignore all client account, People, relationship, session, and provider fields. Map malformed, unauthorized, expired/revoked, rate-limited, Worker-unavailable, and TURN-unconfigured failures to product-safe JSON categories. Confirm the route is dynamic and never falls back to the legacy Worker endpoint.

- [ ] **Step 5: Run focused tests and commit.**

Run: `pnpm --filter @flicksend/engine-lab exec vitest run app/signaling/turn-credentials.server.test.ts app/signaling/capabilities.server.test.ts`

Expected: PASS for sender, guest receiver, expiry, revocation, TTL, rate limit, no-secret output, and Worker outage.

```bash
git add apps/engine-lab/app/signaling apps/engine-lab/app/api/persistence/signaling
git commit -m "feat: add p14 turn credential issuer"
```

### Task 5: Integrate Prepared ICE Configuration Without Engine Changes

**Files:**
- Create: `apps/engine-lab/app/signaling/turn-client.ts`, `apps/engine-lab/app/signaling/turn-client.test.ts`
- Modify: `apps/engine-lab/app/signaling/production-client.ts`, `apps/engine-lab/app/send/send-controller.ts`, `apps/engine-lab/app/receive/receive-controller.ts`, `apps/engine-lab/app/send/send-controller.test.ts`, `apps/engine-lab/app/receive/receive-controller.test.ts`

**Interfaces:**
- Produces `ProductionIceConfigurationProvider(capability)` implementing the existing structural `IceConfigurationProvider` interface.
- It consumes only a capability and `IceRoutePolicy`, calls Railway, validates `ClientIceConfiguration`, and returns `RTCConfiguration`.

- [ ] **Step 1: Write failing adapter and controller tests.**

```ts
await expect(provider.getConfiguration({ policy: "RELAY_ONLY", sessionCode: "000000", peerId: peer })).resolves.toMatchObject({
  iceTransportPolicy: "relay"
});
expect(coordinatorFactory).toHaveBeenCalledWith(signalingUrl, expect.any(Object));
expect(newTransferId).not.toBeCalled();
```

- [ ] **Step 2: Run the focused tests and confirm they fail.**

Run: `pnpm --filter @flicksend/engine-lab exec vitest run app/signaling/turn-client.test.ts app/send/send-controller.test.ts app/receive/receive-controller.test.ts`

Expected: failures because production ICE configuration is not injected.

- [ ] **Step 3: Implement the browser adapter and controller injection.**

The adapter posts the capability to Railway, validates the exact DTO, maps failures to existing safe `FS_TURN_*` categories, and sets `iceTransportPolicy` to `"relay"` only for `RELAY_ONLY`; `AUTO` stays `"all"`. Controllers construct it only for authorized production signaling sessions. Keep M7 local fixture configuration intact and never import Railway/auth code into `engine-core` or `@flicksend/transport-webrtc`.

- [ ] **Step 4: Add direct-first and recovery assertions.**

Assert AUTO requests retain all candidates, RELAY_ONLY uses the prepared relay config, a credential renewal does not issue a new transfer identity, and relay failure maps to a recoverable safe product error without `COMPLETED`.

- [ ] **Step 5: Run focused tests and commit.**

Run: `pnpm --filter @flicksend/engine-lab test`

Expected: PASS with retained P4/P5/P8 behavior.

```bash
git add apps/engine-lab/app/signaling apps/engine-lab/app/send apps/engine-lab/app/receive
git commit -m "feat: integrate p14 prepared ice configuration"
```

### Task 6: Create Sanitized Coturn Deployment Artifacts

**Files:**
- Create: `infra/turn/compose.production.yaml`, `infra/turn/turnserver.conf.template`, `infra/turn/.env.example`, `infra/turn/firewall.md`, `infra/turn/README.md`
- Modify: `services/turn/README.md`

**Interfaces:**
- Produces a provider-neutral deployment template requiring `TURN_REALM`, `TURN_EXTERNAL_IP`, and `TURN_SHARED_SECRET` only at deployment time.

- [ ] **Step 1: Write a failing static artifact test.**

```ts
expect(template).toContain("use-auth-secret");
expect(template).toContain("min-port=49160");
expect(template).not.toMatch(/static-auth-secret=.+[^${}]/);
expect(compose).toContain("3478:3478/udp");
```

- [ ] **Step 2: Run the test and confirm it fails because production artifacts are absent.**

Run: `pnpm exec vitest run tests/p14/coturn-artifacts.test.ts`

Expected: failure for missing files.

- [ ] **Step 3: Implement provider-neutral hardened templates.**

Use coturn REST/shared-secret auth, `lt-cred-mech`, fingerprinting, disabled CLI, no multicast peers, minimum log verbosity, explicit realm/external IP mapping, and only UDP/TCP `3478` plus `49160-49200` relay ports. The `.env.example` contains names only. Firewall guidance restricts SSH/admin access and states TLS/TURNS is `NOT QUALIFIED` until an approved hostname/certificate is deployed and tested.

- [ ] **Step 4: Document host constraints and no-open-relay rule.**

State that Railway suitability is unproven, public UDP/TCP and relay range must be verified before selection, and coturn logs/network metadata cannot be copied into FlickSend product storage or analytics.

- [ ] **Step 5: Run static checks and commit.**

Run: `pnpm exec vitest run tests/p14/coturn-artifacts.test.ts && pnpm format:check`

Expected: PASS.

```bash
git add infra/turn services/turn/README.md tests/p14/coturn-artifacts.test.ts
git commit -m "docs: add p14 coturn deployment artifacts"
```

### Task 7: Add P13/P14 Deterministic Qualification Runners

**Files:**
- Create: `tests/p13/run-qualification.mjs`, `tests/p14/run-qualification.mjs`, `tests/p13-p14/run-integration-qualification.mjs`, `tests/p13/qualification.test.ts`, `tests/p14/qualification.test.ts`, `tests/p13-p14/qualification.test.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces `pnpm qualification:p13`, `pnpm qualification:p14`, and `pnpm qualification:p13-p14`.
- Each prints a sanitized JSON result with `repositoryStatus`, `externalStatus`, and a fixed blocked reason when credentials/host configuration is absent.

- [ ] **Step 1: Write failing runner output tests.**

```ts
expect(result).toMatchObject({
  repositoryStatus: "PASS",
  externalStatus: "BLOCKED",
  blockedReason: "PERSISTENT_CLOUDFLARE_STAGING_QUALIFICATION_NOT_EXECUTED"
});
```

- [ ] **Step 2: Run runner tests and confirm they fail.**

Run: `pnpm exec vitest run tests/p13/qualification.test.ts tests/p14/qualification.test.ts tests/p13-p14/qualification.test.ts`

Expected: failure because commands and structured results are absent.

- [ ] **Step 3: Implement P13 runner.**

Run Worker unit tests and configuration/source scans locally. If no explicit `FLICKSEND_P13_EXTERNAL=1` and required non-secret endpoint configuration are present, print `repositoryStatus: "PASS"` only after local checks pass and `externalStatus: "BLOCKED"`. With the switch, require a persistent configured endpoint and execute health/admission/reconnect/revocation tests; never substitute a preview URL.

- [ ] **Step 4: Implement P14 and combined runners.**

P14 executes server/ICE/artifact tests locally and blocks external evidence without an explicit public host switch. The combined runner executes both local suites and blocks unless both external switches are valid. None creates cloud resources, accepts credentials on a command line, or writes secret-bearing artifacts.

- [ ] **Step 5: Run commands and commit.**

Run: `pnpm qualification:p13 && pnpm qualification:p14 && pnpm qualification:p13-p14`

Expected: local checks PASS; each external stage reports the exact required `BLOCKED` status.

```bash
git add package.json tests/p13 tests/p14 tests/p13-p14 .gitignore
git commit -m "test: add p13 p14 qualification runners"
```

### Task 8: Write P13/P14 Operations, Security, And Evidence Documentation

**Files:**
- Create: `docs/P13-SIGNALING-DEPLOYMENT.md`, `docs/P13-SIGNALING-OPERATIONS.md`, `docs/P13-SIGNALING-SECURITY.md`, `docs/P13-ENVIRONMENT-CONTRACT.md`, `docs/P13-IMPLEMENTATION-REPORT.md`, `docs/P14-TURN-ARCHITECTURE.md`, `docs/P14-TURN-SECURITY.md`, `docs/P14-TURN-DEPLOYMENT.md`, `docs/P14-TURN-QUALIFICATION.md`, `docs/P14-IMPLEMENTATION-REPORT.md`, `docs/P13-P14-INTEGRATION-REPORT.md`, `docs/adr/050-p13-environment-separated-signaling.md`, `docs/adr/051-p14-railway-turn-credential-issuer.md`
- Modify: `docs/adr/README.md`, `docs/ROADMAP.md`, `docs/DEFERRED-RISKS.md`, `apps/signaling/README.md`

**Interfaces:**
- Produces phase reports that distinguish local implementation pass from external verification block and retain no secrets, capabilities, user IDs, private hosts, or network data.

- [ ] **Step 1: Write documentation validation tests.**

```ts
expect(p13Report).toContain("BLOCKED — PERSISTENT CLOUDFLARE STAGING QUALIFICATION NOT EXECUTED");
expect(p14Report).toContain("BLOCKED — PUBLIC TURN INFRASTRUCTURE QUALIFICATION NOT EXECUTED");
expect(allDocs).not.toMatch(/TURN_SHARED_SECRET=[^${\n]+/);
```

- [ ] **Step 2: Run validation and confirm it fails.**

Run: `pnpm exec vitest run tests/p13-p14/documentation.test.ts`

Expected: failure because reports/ADRs do not exist.

- [ ] **Step 3: Write the operations and security documents.**

P13 documents Wrangler environment isolation, secret rotation/rollback procedure, DO migrations, origin/rate bounds, health, safe logging, and Railway configuration. P14 documents coturn REST HMAC-SHA1 credentials, 30-minute TTL/renewal, firewall, no-open-relay controls, guest bounded authorization, no TLS claim, logging/privacy, and public-host prerequisites.

- [ ] **Step 4: Record truthful status and ADRs.**

Reports must state implementation result separately from the unavailable persistent Cloudflare/public coturn evidence. `AGENTS.md` remains `AUTHORIZED / IN PROGRESS`; do not mark either phase frozen. The integration report must state no P15+ scope and the M4-M10 decision is not rerun because no engine correctness code changed.

- [ ] **Step 5: Run document validation and commit.**

Run: `pnpm exec vitest run tests/p13-p14/documentation.test.ts && pnpm format:check`

Expected: PASS.

```bash
git add docs apps/signaling/README.md tests/p13-p14/documentation.test.ts
git commit -m "docs: record p13 p14 operational boundaries"
```

### Task 9: Execute Regression And Close the Repository-Owned Work

**Files:**
- Modify: `docs/P13-IMPLEMENTATION-REPORT.md`, `docs/P14-IMPLEMENTATION-REPORT.md`, `docs/P13-P14-INTEGRATION-REPORT.md`

**Interfaces:**
- Produces retained command output summaries and the three final blocked-state reports.

- [ ] **Step 1: Run formatting and static verification.**

Run: `pnpm format:check && pnpm typecheck && pnpm lint`

Expected: all PASS.

- [ ] **Step 2: Run unit, browser, and retained P12 qualification.**

Run: `pnpm test && pnpm test:e2e && pnpm qualification:p12`

Expected: all PASS; preserve any existing environment-gated counts verbatim.

- [ ] **Step 3: Run P13/P14 qualification commands.**

Run: `pnpm qualification:p13 && pnpm qualification:p14 && pnpm qualification:p13-p14`

Expected: repository/local deterministic checks PASS; external statuses remain BLOCKED with the exact phase-specific reasons.

- [ ] **Step 4: Build and update factual reports.**

Run: `pnpm build`

Expected: PASS. Record actual test counts, commands, external blocker status, no database migration, and no M4-M10 rerun in each report. Do not claim deployment, rollback, TLS/TURNS, physical throughput, or final phase completion.

- [ ] **Step 5: Commit closeout documentation only after every required local command passes.**

```bash
git add docs/P13-IMPLEMENTATION-REPORT.md docs/P14-IMPLEMENTATION-REPORT.md docs/P13-P14-INTEGRATION-REPORT.md
git commit -m "docs: close p13 p14 repository implementation"
```

### Task 10: External Qualification Is a Separate Future Gate

**Files:**
- Modify later only when real evidence exists: P13/P14/integration reports and `AGENTS.md`

**Interfaces:**
- Produces a final `PASS` only from persistent Cloudflare staging and public coturn evidence, never from local Docker or preview Workers.

- [ ] **Step 1: Obtain provider access outside the repository.**

Create a persistent Cloudflare staging Worker/DO, configure Railway staging secrets and Worker URL, and provision a public coturn host with the documented ports. Do not place credentials in the repository or terminal history.

- [ ] **Step 2: Deploy staged infrastructure with provider-managed secrets.**

Run the documented Wrangler staging deployment and coturn host deployment. Record only environment class, safe build/version, command, and result.

- [ ] **Step 3: Execute P13 real WebSocket evidence.**

Run: `FLICKSEND_P13_EXTERNAL=1 pnpm qualification:p13`

Expected: only a persistent staging Worker/DO can return external `PASS`; otherwise retain `BLOCKED` or `FAIL`.

- [ ] **Step 4: Execute P14 real relay evidence and combined evidence.**

Run: `FLICKSEND_P14_EXTERNAL=1 pnpm qualification:p14 && FLICKSEND_P13_EXTERNAL=1 FLICKSEND_P14_EXTERNAL=1 pnpm qualification:p13-p14`

Expected: real public relay allocation/DataChannel/verified delivery and stable transfer identity, without throughput claims.

- [ ] **Step 5: Seek external review before freezing phases.**

Only after both gates pass and external review accepts the evidence may `AGENTS.md` mark P13/P14 `COMPLETE / FROZEN`. P15/P16 stay unauthorized until that review.

## Plan Self-Review

- **Spec coverage:** Tasks 1-3 implement P13 configuration, Worker safety, operations, and eligibility. Tasks 4-6 implement Railway issuance, prepared ICE, and coturn artifacts. Task 7 separates local/external evidence. Task 8 covers required docs/ADRs. Tasks 9-10 cover all regressions, blocked reports, and future external gates.
- **Placeholders:** No task defers an implementation detail without naming the safe behavior, interface, test, or external blocker.
- **Type consistency:** `ClientIceConfiguration`, `FlickSendEnvironment`, `VerifiedSignalingCapability`, `TurnCredentialService`, and `ProductionIceConfigurationProvider` are defined before their consuming tasks. `engine-core` remains unchanged by design.
