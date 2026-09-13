# FlickSend Engine Lab

FlickSend is a browser-first system for delivering huge files and folders between people.

This repository implements M7 route fallback alongside the accepted M4/M5/M6 transfer path: a
bounded-memory WebRTC folder pipeline with canonical metadata-first manifests, virtual file ranges,
SHA-256 logical block verification, receiver-owned verified recovery, and folder-root delivery
verification. It does not include authentication, database models, billing,
application-layer encryption, offline delivery, Mesh, or Turbo.

## Commands

- `pnpm install`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm dev:engine-lab`
- `pnpm --filter @flicksend/signaling dev`
- `pnpm test:e2e`
- `pnpm qualification:m7`
- `pnpm qualification:m8`
- `pnpm qualification:m9`
- `pnpm qualification:m9:macos` (run on a real macOS host)
- `pnpm qualification:m10` (local preflight only; not physical completion)
- `pnpm qualification:m10:sender` / `pnpm qualification:m10:receiver` (two-machine inventory)
- `pnpm qualification:m10:network` / `pnpm qualification:m10:disk` / `pnpm qualification:m10:sample`
- `pnpm qualification:m10:retain` (sanitized two-machine transfer evidence)
- `pnpm bench:m3:plan -- --dataset=zero-10g --size-gib=10`
- `pnpm bench:m3:compare`
