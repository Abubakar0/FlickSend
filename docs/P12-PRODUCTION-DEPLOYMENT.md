# P12 Production Deployment

## Service Boundary

Deploy the Engine Lab application and PostgreSQL on Railway or an equivalent application environment. Deploy the signaling Worker and its Durable Object binding to Cloudflare. PostgreSQL is product metadata/control plane; Cloudflare is ephemeral signaling control plane. Do not deploy `DATABASE_URL` to Cloudflare and do not publish any application, database, Clerk, or TURN secret to browser code.

## Required Configuration

Application runtime requires server-only `DATABASE_URL`, the Clerk server/public configuration already required by P10, `SIGNALING_CAPABILITY_SECRET` with at least 32 UTF-8 bytes, and `NEXT_PUBLIC_PRODUCTION_SIGNALING_URL` containing a public `wss://` Worker origin without URL credentials. The signaling secret must be exactly the same in the application runtime and Worker secret store.

Cloudflare binds `SESSION_DIRECTORY`, `SESSION_ROOM`, and `PRODUCTION_SESSION_ROOM` from `apps/signaling/wrangler.jsonc`. Set `SIGNALING_CAPABILITY_SECRET` with `wrangler secret put`; never add it to source, `wrangler.jsonc`, `.env`, tests, screenshots, or documentation. Deploy using the workspace Node version required by `package.json` (Node 24 or later) and the committed Wrangler configuration.

The application must return generic signaling-unavailable behavior when its PostgreSQL connection, Worker URL, or signing secret is absent. Production must not use P6 pairing codes, process-local People repositories, or the local M1 signaling server as a fallback.

## Migration

Apply committed Prisma migrations using `pnpm --filter @flicksend/database run migrate:deploy` with the intended Railway PostgreSQL `DATABASE_URL`. Do not use `prisma db push`. The P12 migration creates the invitation status enum, digest-only invitation table, lifecycle check constraint, indexes, and Account foreign keys.

## Operations

Worker logs must not retain capability URLs, SDP, ICE, payload, files, paths, database credentials, or provider subjects. Durable Objects retain only active socket hibernation attachments (role and expiry) and short-lived revocation state. They are not a historical signaling store.

P12 qualification used an ephemeral Cloudflare preview Worker with a real Durable Object and real WebSocket clients. That is infrastructure evidence only, not a persistent staging or production deployment. An operator must create and maintain the actual production Worker, Worker secret, DNS/domain policy, monitoring, retention policy, and incident process in a later authorized operational phase.
