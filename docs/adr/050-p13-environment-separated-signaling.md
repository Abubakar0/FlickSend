# ADR 050: Separate P13 Signaling Environments

## Status

Accepted for repository implementation; persistent environment qualification remains blocked.

## Context

P12 proved temporary Worker/DO signaling but did not establish environment-separated deployment,
operational origin policy, or secret handling. Reusing one Worker name or permitting broad origins
would make staging and production authority ambiguous.

## Decision

Use distinct Cloudflare Worker names for development, staging, and production. Declare all Durable
Object bindings and migration definitions per environment. Validate the exact environment class,
public `wss:` Worker root, and allowed browser origins through `@flicksend/config`. Keep the
capability secret in provider-managed secret stores. Expose only bounded health and generic errors.

## Consequences

Railway staging can target only its staging Worker origin, and the server derives the corresponding
relay-eligibility HTTPS endpoint from that root. A preview or local Worker cannot qualify persistent
staging. No payload, transfer integrity, or engine behavior changes.
