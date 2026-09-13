# M6 Implementation Report

## Final Status

M6 STREAMPACK / FOLDER TRANSFER: COMPLETE

M6 FINAL VERIFICATION: PASS

FlickSend transfers folders as canonical StreamPack virtual byte streams over FSTP v5. It does not
archive folders, route payload through an application API, or load an entire folder into memory.
M7 has not started.

## Delivered Design

- Canonical NFC UTF-8 manifests, portable-path validation, deterministic file IDs, and hierarchy-bound
  FSPK roots.
- 8 MiB SHA-256 logical blocks, <=64 KiB FSTP v5 payload frames, bounded manifest chunks, and indexed
  virtual range mapping across files.
- Zero-byte-file and empty-directory preservation, plus bounded 16-handle OPFS LRU destination writers.
- `DELIVERED` only after all blocks are verified, the FSPK root matches, and destination close succeeds.
- Receiver-authoritative verified recovery: transfer identity is stable, `STREAMPACK_HAVE_VERIFIED_BLOCKS`
  reconciles persisted progress, and committed verified blocks are not resent.
- Source changes after interruption fail as `FS_STREAMPACK_SOURCE_CHANGED`; modified destination recovery
  state fails as `FS_STREAMPACK_DESTINATION_CHANGED`.
- Ordered asynchronous frame handling, bounded metadata-only protocol traces, and a bounded WebRTC
  low-water fallback for Chromium missed `bufferedamountlow` notifications.

## Browser/WebRTC Qualification

Executed with two isolated Playwright Chromium contexts, local Engine Lab, and local Wrangler signaling.
This is functional correctness evidence, not a physical-performance qualification. Raw artifact JSON is
preserved verbatim in `benchmarks/results/2026-09-08/`.

| Scenario                                | Actual result                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Structural folder                       | PASS: 3 files, 3 directories, 8 payload bytes, root verified, tree matched                                                           |
| Mixed hierarchy                         | PASS: 131 files, 5 directories, 17,304,188 payload bytes, 14,563 manifest bytes, 16 writer peak, root verified, tree matched         |
| 10,000 tiny files                       | PASS: 10,000 files, 103 directories, 49,598,976 payload bytes, 1,147,646 manifest bytes, 16 writer peak, root verified, tree matched |
| One corrupted StreamPack block          | PASS: one integrity retry, then delivered with verified root                                                                         |
| Source mutation after interruption      | PASS: `FS_STREAMPACK_SOURCE_CHANGED`, not delivered                                                                                  |
| Destination mutation after interruption | PASS: `FS_STREAMPACK_DESTINATION_CHANGED`, not delivered                                                                             |

### Folder Resume Evidence

The single interruption ran after the first verified block. The transfer ID remained stable,
`STREAMPACK_HAVE_VERIFIED_BLOCKS` was observed, only missing work was resumed, and the final tree/root
matched.

| Metric                                  | Actual value |
| --------------------------------------- | -----------: |
| reconnect count                         |            1 |
| reconciliation time                     |     591.8 ms |
| safe bytes before disconnect            |    8,388,608 |
| remaining bytes at resume               |    8,915,580 |
| resumed payload bytes                   |    8,915,580 |
| duplicate retransmitted bytes           |            0 |
| committed blocks retransmitted          |            0 |
| ambiguous in-flight bytes retransmitted |    8,388,608 |

The multi-interruption fixture was interrupted at 8 MiB, 24 MiB, and 40 MiB committed-safe thresholds.
The transfer ID remained stable, all three reconciliations used receiver-authoritative verified state, and
the final tree/root matched.

| Metric                                             | Actual value |
| -------------------------------------------------- | -----------: |
| reconnect count                                    |            3 |
| final reconciliation time                          |    1188.5 ms |
| safe bytes before final disconnect                 |   41,943,040 |
| remaining bytes at final resume                    |    6,818,428 |
| cumulative resumed payload bytes                   |   55,579,896 |
| duplicate retransmitted bytes                      |            0 |
| committed blocks retransmitted                     |            0 |
| cumulative ambiguous in-flight bytes retransmitted |   23,595,644 |

`safeBytesBeforeDisconnect + remainingBytesAtResume` equals the logical payload in both qualifying
fixtures. Ambiguous in-flight resend is acceptable recovery overhead; it is not duplicate transmission
of receiver-committed progress.

## Security And Correctness Coverage

- The StreamPack unit matrix has 26 tests for canonical manifests, path traversal, absolute and Windows
  paths, NUL/reserved/trailing components, NFC canonical form, duplicate canonical paths, parent
  structure, IDs, and block counts.
- The M6 engine suite has 7 cases covering structural delivery, async write ordering, corruption retry,
  single recovery, ambiguous in-flight accounting, source mutation, and destination mutation.
- Browser qualification proves actual WebRTC and OPFS delivery, root verification, reconstructed-tree
  equality, corruption retry, same-ID recovery, and explicit safety failures.

## Final Verification

- `pnpm typecheck`: PASS, 18 Turbo tasks
- `pnpm lint`: PASS, 10 Turbo tasks
- `pnpm test`: PASS, 86 tests across 17 Turbo tasks
- `pnpm test:e2e`: PASS, 13 passed / 5 skipped in 6.8 minutes
- `pnpm build`: PASS, 10 Turbo tasks

## Explicit Skips

The five Playwright skips are fixture-gated long-run qualifications and are not treated as M6 failures:

| Test                                    | Reason                                                                  | Classification                                              |
| --------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `m2-large.spec.ts`                      | `FLICKSEND_M2_BENCHMARK_FILE` was not supplied                          | Manual physical large-file benchmark                        |
| `m4b-large.spec.ts`                     | Supported 1/10 GiB fixture, size, and 10/50/90% point were not supplied | Environment-provisioned M4B long-run qualification          |
| `m4b-multi-interruption.spec.ts`        | `FLICKSEND_M4B_MULTI_BENCHMARK_FILE` was not supplied                   | Environment-provisioned 1 GiB M4B qualification             |
| `m5-qualification.spec.ts` normal 1 GiB | `FLICKSEND_M5_BENCHMARK_FILE` was not supplied                          | Environment-provisioned M5 long-run integrity qualification |
| `m5-qualification.spec.ts` 1 GiB resume | `FLICKSEND_M5_BENCHMARK_FILE` was not supplied                          | Environment-provisioned M5 long-run integrity qualification |

## Scope Boundaries

- M3 physical performance qualification: DEFERRED
- M4 10 GiB long-run qualification: environmental timeout / deferred evidence
- M7 TURN / route recovery: NOT STARTED
- Application-layer payload encryption: NOT STARTED
- Mesh and Turbo: NOT STARTED
