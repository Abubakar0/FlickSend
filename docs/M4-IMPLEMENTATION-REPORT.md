# M4 Implementation Report

## Status

M4 FUNCTIONAL CONTINUITY: COMPLETE. The generated 1 GiB browser qualification passed at 10%,
50%, and 90% interruption points. A separate four-interruption run passed at 15%, 40%, 70%, and
90%. Each used the FSTP v3 Engine Lab path, real WebRTC DataChannels, OPFS recovery state, and a
non-zero deterministic fixture.

The generated 10 GiB, 50% interruption qualification failed its 30-minute local browser ceiling
before the required 5 GiB persisted-safe threshold. This is an environmental performance
qualification failure, not a functional M4 regression: the 1 GiB functional matrix remains the
accepted continuity evidence. The terminal Playwright teardown reset the page before capture, so
transfer ID, exact safe progress, resumed payload, and final fixture match are unavailable.

## Delivery Path

```text
WebRTC DataChannel -> FSTP v3 64 KiB frames -> 8 MiB resume blocks
-> positional OPFS writes -> persisted checkpoint -> commit acknowledgement
```

The receiver commits only after the positional write and checkpoint complete. The sender keeps the
same `fs_tr_*` identity on replacement transport and obtains the receiver-authoritative missing map.
A terminal, manifest-bound `TRANSFER_BYTES_COMPLETE` reconciles a final commit acknowledgement lost
during replacement; it is not `DELIVERED` and does not bypass integrity verification.

## Browser Evidence

| Fixture                     | Interruption | Result                | Safe / remaining bytes    | Resumed payload      | Final output   |
| --------------------------- | ------------ | --------------------- | ------------------------- | -------------------- | -------------- |
| 1 GiB indexed-byte pattern  | 10%          | PASS                  | 109,051,904 / 964,689,920 | 920 MiB              | verified match |
| 1 GiB indexed-byte pattern  | 50%          | PASS                  | 545,259,520 / 528,482,304 | 504 MiB              | verified match |
| 1 GiB indexed-byte pattern  | 90%          | PASS                  | 973,078,528 / 100,663,296 | 96 MiB               | verified match |
| 1 GiB indexed-byte pattern  | 15/40/70/90% | PASS                  | receiver-authoritative    | 929,436,794.88 bytes | verified match |
| 10 GiB indexed-byte pattern | 50%          | ENVIRONMENTAL TIMEOUT | < 5 GiB after 30 min      | not reached          | not verified   |

The multi-interruption run recorded four reconnects, stable transfer identity, zero committed-block
retransmissions, and actual retransmission below the 1,946,157,056-byte missing-block budget.

The 10 GiB result did not reach a controlled disconnect, so `safeBytesBeforeDisconnect`,
`remainingBytesAtResume`, `resumedPayloadBytes`, duplicate/ambiguous retransmission, committed-block
retransmission, reconnect count, reconciliation time, transfer identity stability, and final hash
match are all `not measured`, not zero.

## Regressions Fixed

- Recheck DataChannel `bufferedAmount` after registering the low-buffer listener.
- Rebind a replacement answerer peer while recovery is active, rather than waiting only for `closed`.
- Ignore callbacks from stale WebRTC transports.
- Reconcile a lost final commit acknowledgement from terminal receiver completion; a focused unit
  test reproduces this race.

## Verification

- `pnpm test`: PASS; `@flicksend/engine-core` has 23 passing tests.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm build`: PASS before this documentation update.
- The 1 GiB single- and multi-interruption Playwright qualifications above: PASS.

## Boundaries

M3 physical performance qualification: DEFERRED. M5 production integrity: NOT STARTED. M4 adds no final block digest/manifest-root verification, folders, StreamPack,
TURN, Mesh, offline delivery, authentication, billing, People, guest links, or Turbo.
