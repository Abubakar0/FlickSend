# P13 Production Signaling Deployment

P13 packages a three-environment Cloudflare Worker configuration for the temporary, metadata-only
signaling control plane. It is not a deployment record.

## Environments

| Environment | Worker name                       | Allowed application origin                           |
| ----------- | --------------------------------- | ---------------------------------------------------- |
| Development | `flicksend-signaling-development` | local Engine Lab origin only                         |
| Staging     | `flicksend-signaling-staging`     | `https://flicksendengine-lab-staging.up.railway.app` |
| Production  | `flicksend-signaling-production`  | approved production origin only                      |

Each environment declares all three Durable Object bindings and uses the same migration definitions.
Never deploy a preview Worker as staging evidence and never point Railway staging at production.

## Operator sequence

1. Review `apps/signaling/wrangler.jsonc`, including the selected environment, binding names, migration
   definitions, and exact allowed origin.
2. Set `SIGNALING_CAPABILITY_SECRET` with the provider secret mechanism, for example
   `wrangler secret put SIGNALING_CAPABILITY_SECRET --env staging`. Do not place the value in a file,
   command history, client bundle, or application log.
3. Run the staging dry-run and inspect the binding summary before a reviewed persistent deployment.
4. Configure Railway staging with the public `wss:` Worker root only. The Railway service derives its
   server-to-Worker `https:` relay-eligibility endpoint from that validated root; do not configure a
   separate arbitrary eligibility URL.
5. Run the P13 external gate against the persistent Worker, then retain only sanitized outcome evidence.

## Rollback and migration safety

Keep Durable Object class names and migrations stable during ordinary application releases. A rollback
must use a previously reviewed Worker build compatible with the active DO schema; it must not delete
or recreate namespaces to recover from an application issue. If a schema change is necessary, add an
explicit migration and review it before deployment.

`/health` is safe for operational reachability checks only. It must not expose secrets, sessions,
capabilities, peer identities, transfer metadata, candidates, SDP, or payload information.
