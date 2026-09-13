# ADR 029: Use Short-Lived coturn REST Credentials

## Status

Accepted for local M7 qualification; production deployment remains deferred.

## Context

Embedding a TURN shared secret in browser configuration would allow arbitrary relay allocation and
make rotation unsafe. Static per-user credentials are not available before authentication exists.

## Decision

The signaling Worker verifies an active temporary room member and mints a 10-60 minute coturn REST
credential using HMAC-SHA1, as required by coturn's shared-secret REST mechanism. Local M7 compose
pins `coturn/coturn:4.17.2-r0`, generates one secret per qualification run, and removes it afterward.

## Consequences

The browser receives only a temporary username/password and URL lists. Development has explicit
invalid/unreachable negative modes that production rejects. Production TLS, public routing,
secret-management, abuse prevention, and operational controls need separate deployment ADRs.
