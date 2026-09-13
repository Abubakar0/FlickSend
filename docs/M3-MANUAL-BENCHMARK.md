# M3 Manual Benchmark

Use two Chromium profiles or two controlled physical Chromium machines. Do not use Playwright file
injection for a large source because it stages the file through its automation transport.

1. Run the signalling worker and Engine Lab.
2. Create an M3 plan using `pnpm bench:m3:plan -- --dataset=<generated-id> --size-gib=<size>`.
3. On both peers, apply the same M3 configuration before selecting/accepting a file.
4. Select a generated or otherwise non-sensitive file with the native picker. Never place a path or
   real filename in the result report.
5. Receive to a native chosen destination. OPFS is permitted only for controlled benchmark runs.
6. Record `iperf3`, disk read/write, OS/browser versions, CPU, memory, route, and test conditions.
7. Download the Engine Lab JSON after `COMPLETED`, place it beside the plan, and compare reports.

The current code has not passed 1, 10, 25, or 75 GiB physical qualification. `COMPLETED` means
incremental SHA-256 verification passed for that individual run; it is not a general throughput or
memory claim.
