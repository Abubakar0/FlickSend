# M2 Manual Benchmark

Use Chromium with the Engine Lab, not Playwright file injection, for large files. Playwright stages
setInputFiles through its automation protocol and is not a bounded-source benchmark mechanism.

1. Run pnpm --filter @flicksend/signaling dev and pnpm dev:engine-lab.
2. Open two Chromium profiles or two physical Chromium machines.
3. Connect the two labs, select a real file with the native picker on the sender, and offer it.
4. On the receiver, select Choose Destination and Accept. OPFS benchmark storage is permitted only
   for controlled Engine Lab testing.
5. Record duration, route, source/destination storage, observed throughput, memory, bytes, SHA-256
   verification, and result in benchmarks/results.

Run 10 MB, 100 MB, 1 GB, and 10 GB progressively. Do not mark a size PASS until the receiver
reports COMPLETED after TRANSFER_VERIFY_OK.
