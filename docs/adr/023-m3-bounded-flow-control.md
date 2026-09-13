# ADR-023: M3 Bounded Read-Ahead and Receiver Flow Control

## Status

Accepted for Engine Lab M3.

## Context

M2 only gated sender production on `RTCDataChannel.bufferedAmount`. A slow destination writer can
still cause decoded payloads to accumulate in JavaScript memory on the receiver.

## Decision

M3 limits source reads to a byte-based read-ahead window and limits receiver-owned queued and
in-flight write bytes to a configured receive window. The receiver sends `TRANSFER_FLOW_CONTROL`
after successful writes; the sender may not advance beyond `bytesWritten + receiveWindowBytes`.
The control additions require FSTP transfer protocol version 2. Pause and resume are ephemeral M3
controls and never define persisted resume units.

M3 exposes no high watermark above 16 MiB. Same-host Chromium evidence showed its data channel can
reject queued sends below a 32 MiB application watermark, so larger values are not safe portable
configuration candidates.

## Consequences

The slowest of source reading, destination writing, and network transport controls sustained rate
without unbounded application buffering. Extra control messages and a bounded write-batch copy can
trade some peak throughput for correctness. M4 will separately define durable resume blocks.
