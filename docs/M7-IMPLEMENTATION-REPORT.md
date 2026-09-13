# M7 Implementation Report

## Status

M7 TURN / ROUTE RECOVERY: COMPLETE

M7 FINAL VERIFICATION: PASS

The Engine Lab now qualifies direct-first ICE, coturn relay-only ICE, bounded route replacement,
fresh short-lived TURN credentials, and M5/M6 continuity over real Chromium WebRTC DataChannels.
FSTP v4/v5, transfer IDs, receiver-authoritative verified recovery, and integrity checks remain
transport-independent.

## Implementation

- `services/turn/compose.yaml` pins `coturn/coturn:4.17.2-r0` with UDP/TCP listener and relay-port
  support enabled for local coturn qualification. The runner supplies both TURN URL variants but
  does not force a transport-specific allocation.
- The signaling Worker mints bounded 10-60 minute coturn REST credentials with server-side
  HMAC-SHA1 shared secrets. The runner generates and deletes a secret per run.
- `HttpIceConfigurationProvider` fetches fresh configuration for every PeerConnection; browser code
  never receives the shared secret.
- `RouteCoordinator` owns route generation, selected-pair-safe diagnostics, recovery timers, and
  bounded replacement attempts. Stale signaling is rejected by route generation.
- Explicit replacement marks M5/M6 transfers interrupted before detaching the old PeerConnection,
  so the new control channel reconciles the same transfer identity and verified recovery state.
- The M7 runner rebuilds workspace `dist` exports before starting Chromium, preventing stale package
  artifacts from becoming qualification evidence.

## Real Qualification

`pnpm qualification:m7` passed on September 8, 2026: all 10 Chromium scenarios using the pinned
local coturn service. Raw evidence is retained in
[`benchmarks/results/2026-09-08`](../benchmarks/results/2026-09-08).

| Scenario                   | Result                                    | Evidence                                   |
| -------------------------- | ----------------------------------------- | ------------------------------------------ |
| Normal direct M5 file      | PASS, direct selected                     | `m7-direct-route.json`                     |
| Forced TURN M5 file        | PASS, relay selected, root verified       | `m7-forced-turn-single-file.json`          |
| Forced TURN M6 folder      | PASS, relay selected, tree matched        | `m7-forced-turn-folder.json`               |
| Direct to TURN M5 recovery | PASS, ID stable, verified checkpoint kept | `m7-direct-to-turn-resume.json`            |
| TURN to TURN M5 recovery   | PASS, ID stable, relay retained           | `m7-turn-replacement-resume.json`          |
| Direct to TURN M6 recovery | PASS, ID stable, tree/root verified       | `m7-direct-to-turn-streampack-resume.json` |
| TURN to AUTO M5 recovery   | PASS, ID stable; local ICE selected relay | `m7-turn-to-auto-resume.json`              |
| Invalid credentials        | PASS, terminal `FS_TURN_AUTH_FAILED`      | `m7-invalid-turn-credentials.json`         |
| Expired credentials        | PASS, terminal `FS_TURN_UNREACHABLE`      | `m7-expired-turn-credentials.json`         |
| Unreachable relay          | PASS, terminal `FS_TURN_UNREACHABLE`      | `m7-route-exhaustion.json`                 |

The optional TURN-to-direct attempt used `AUTO` and delivered on the same transfer ID, but the local
ICE agent selected relay again (`directReacquired: false`). Direct reacquisition is therefore not
claimed as qualified; normal direct and direct-to-relay routes are separately proven.

### TURN Transport Coverage

The forced-relay M5 and M6 records selected `RELAY_UDP` on both peers
(`m7-forced-turn-single-file.json` and `m7-forced-turn-folder.json`). TCP was also observed in
passing recovery records: the sender selected `RELAY_TCP` in `m7-direct-to-turn-resume.json`, and
the receiver selected `RELAY_TCP` in `m7-turn-replacement-resume.json`.

These are selected-pair observations, not separate transport qualifications. `RELAY_ONLY` maps to
WebRTC's relay policy and the runner supplies both `turn:...?transport=udp` and
`turn:...?transport=tcp` URLs; no M7 scenario supplies only TCP or only UDP, nor asserts one was
chosen. TURN/TCP is therefore not independently or explicitly qualified. M7 claims real coturn
relay qualification, not separate UDP/TCP transport certification.

## Continuity Evidence

The direct-to-TURN M5 run used a 40 MiB, five-logical-block fixture. It retained the transfer ID,
waited for one 8 MiB receiver-verified checkpoint before interruption, then completed after one
intentional integrity retry. It recorded `safeBytesBeforeDisconnect: 8,388,608`,
`remainingBytesAtResume: 33,554,432`, `resumedPayloadBytes: 41,943,040`,
`duplicateRetransmittedBytes: 0`, and `committedBlocksRetransmitted: 0`. The resumed payload total
includes the bounded integrity retry, not a retransmission of receiver-committed data. It measured
525.1 ms route recovery and 165.4 ms to first resumed payload.

The direct-to-TURN M6 run delivered the 17,304,188-byte mixed StreamPack fixture with final tree and
manifest-root match. It recorded `safeBytesBeforeDisconnect: 0`,
`remainingBytesAtResume: 17,304,188`, `resumedPayloadBytes: 17,304,188`,
`duplicateRetransmittedBytes: 0`, `committedBlocksRetransmitted: 0`, and 8 MiB of acceptable
ambiguous in-flight resend. It measured 561.2 ms route recovery and 923.1 ms to first resumed
payload.

Already verified progress is preserved. `resumedPayloadBytes` includes missing bytes and any
uncommitted in-flight resend; it is not described generically as duplicate retransmission.

## Security Boundaries

- Payload bytes continue to traverse only WebRTC DataChannels, never the signaling Worker.
- Credential requests are capped at 1 KiB, validate session/peer identifiers, require a validated
  temporary session admission, and are rate-limited per peer.
- Published diagnostics exclude candidate strings, addresses, SDP, passwords, credentials, paths,
  filenames, and payload contents.
- Local coturn has no trusted TLS certificate and is qualification infrastructure only. Production
  TURN still requires public address mapping, TLS, firewalling, secret rotation, abuse controls,
  monitoring, cost controls, and regional capacity planning.

## Verification

| Command                 | Actual result                                  |
| ----------------------- | ---------------------------------------------- |
| `pnpm qualification:m7` | PASS, 10/10 Chromium/coturn scenarios          |
| `pnpm typecheck`        | PASS, 20 Turbo tasks                           |
| `pnpm lint`             | PASS, 11 Turbo tasks                           |
| `pnpm test`             | PASS, 116 unit tests across 19 Turbo tasks     |
| `pnpm test:e2e`         | PASS, 15 browser tests; 15 gated tests skipped |
| `pnpm build`            | PASS, 11 Turbo tasks                           |

### Default E2E Gating

The ordinary `pnpm test:e2e` run skips 15 tests by design. Ten are the M7 coturn scenarios, gated
by `FLICKSEND_M7_TURN_QUALIFICATION=1` because `pnpm qualification:m7` must provision the local
coturn service and ephemeral credentials; they are inside the M7 scope and passed in that command.
The other five are one M2, two M4B, and two M5 large-fixture qualifications that require explicitly
supplied 1 GiB or 10 GiB benchmark files and are outside the active M7 qualification scope.

The items below are outside the M7 acceptance boundary and do not block M7 completion. They remain
separate requirements with their own evidence and acceptance criteria.

## Deferred

- M3 physical performance qualification: DEFERRED
- Production TURN deployment and multi-region route selection: DEFERRED
- WebTransport/HTTP3 relay: NOT STARTED
- Application-layer payload encryption: NOT STARTED
- Offline delivery, Mesh, and Turbo: NOT STARTED
- M8 Transfer Health / SpeedProof: COMPLETE after M7; see `docs/M8-IMPLEMENTATION-REPORT.md`

The September 9 M8 closeout refreshed the direct-to-TURN M5 evidence above and added the dedicated
`m8-direct-to-turn-route-health.json` observer record. M7 route architecture and acceptance
boundaries remain unchanged.
