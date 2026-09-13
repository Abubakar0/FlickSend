# M3 Benchmark Plan

M3 benchmark defaults are candidates, not production promises. Run each configuration with the
native browser file picker, direct destination writing, and the Engine Lab JSON export. Do not use
Playwright `setInputFiles` for multi-gigabyte sources because its automation transport stages input.

## Candidate Matrix

| ID  |   Frame | Low water | High water | Read-ahead | Write batch | Channels |
| --- | ------: | --------: | ---------: | ---------: | ----------: | -------: |
| A   |  32 KiB |     1 MiB |      4 MiB |    256 KiB |      64 KiB |        1 |
| B   |  64 KiB |     2 MiB |      8 MiB |    256 KiB |     256 KiB |        1 |
| C   |  64 KiB |     2 MiB |     16 MiB |    512 KiB |     256 KiB |        1 |
| D   | 128 KiB |     2 MiB |     16 MiB |    512 KiB |       1 MiB |        1 |
| E   | 256 KiB |     4 MiB |     16 MiB |      1 MiB |       1 MiB |        1 |

Only run a frame when the negotiated maximum safely supports header plus payload. Run 1, 10, 25,
and 75 GiB sizes where the designated physical lab has capacity. Record `iperf3`, sequential disk
read/write baselines, OS/browser versions, memory, CPU, throttle, RTT, loss, route, and integrity.

The Engine Lab caps the sender high watermark at 16 MiB. A same-host Chromium test showed that a
32 MiB high watermark allowed `RTCDataChannel.send()` to be rejected before its application-level
backpressure gate ran. The rejected configuration is retained as negative compatibility evidence,
not a benchmark result.

The Engine Lab records transfer metrics and configuration. OS tools must record CPU and memory;
browser APIs do not provide trustworthy cross-browser process-memory or CPU measurements.

## Worker and Channel Experiments

M3 ships a main-thread WebRTC orchestration path with a one-channel reliable ordered data route.
Worker placement and two/four-channel experiments remain planned but unselected until controlled
browser evidence exists. They must not replace the baseline path without a new ADR and benchmarks.
