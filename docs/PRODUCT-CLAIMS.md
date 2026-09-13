# Product Claims Policy

## Rule

Product, support, sales, and future marketing copy must use only claims whose status permits the
intended audience and context. A working brand or product definition does not itself establish a
marketing, legal, security, performance, or compatibility claim.

| Status                | Meaning                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `QUALIFIED`           | Supported by a relevant retained implementation/evidence record, within stated limits.       |
| `PARTIALLY_QUALIFIED` | Supported only in the stated environment; copy must retain the limitation.                   |
| `NOT_QUALIFIED`       | Evidence is absent or inadequate; do not make a public support/performance claim.            |
| `PROHIBITED`          | Not a V1 feature or an inherently unsupported/unsafe claim without a future approved review. |

## Claim Registry

| Claim or category                                                                        | Status                | Permitted wording or restriction                                                                              |
| ---------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Receiver-verified completion requires integrity and destination finalization.            | `QUALIFIED`           | “Completed after verification.” Do not say “completed” before `DELIVERED`.                                    |
| Passing recovery qualifications did not resend receiver-committed blocks.                | `QUALIFIED`           | “Verified progress is preserved during supported recovery.” Do not imply every interruption/restart recovers. |
| Browser-first files and folders transferred directly when possible.                      | `PARTIALLY_QUALIFIED` | Positioning only. Production route/availability language awaits production deployment evidence.               |
| Windows Chrome/Edge V1 availability.                                                     | `PARTIALLY_QUALIFIED` | Windows-first, with documented browser/picker limitations.                                                    |
| Firefox Windows availability.                                                            | `PARTIALLY_QUALIFIED` | Secondary with documented limitations; never imply feature parity.                                            |
| macOS or mobile support.                                                                 | `NOT_QUALIFIED`       | Say “Not yet qualified,” never “works everywhere.”                                                            |
| Physical network utilization, LAN/WAN speed, or physical TURN throughput.                | `NOT_QUALIFIED`       | Same-host records do not support this claim.                                                                  |
| “Fastest,” “10x faster,” “line-rate,” “gigabit,” or competitor-speed superiority.        | `PROHIBITED`          | Requires future relevant evidence, legal review, and explicit approval.                                       |
| Cloud drive/storage, offline delivery, background transfer, browser restart persistence. | `PROHIBITED`          | Not a V1 product promise.                                                                                     |
| FlickSend application-layer E2EE, zero knowledge, or “military-grade encryption.”        | `PROHIBITED`          | Not implemented or qualified.                                                                                 |
| Working brand, trademark, domain, or legal availability.                                 | `PROHIBITED`          | P2 owns clearance; do not claim it before then.                                                               |

The evidence-specific performance registry remains [PERFORMANCE-CLAIMS.md](PERFORMANCE-CLAIMS.md).
When these two policies differ, the narrower claim restriction wins.
