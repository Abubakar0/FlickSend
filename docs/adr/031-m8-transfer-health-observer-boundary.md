# ADR 031: Keep Transfer Health Outside Transfer Correctness

## Decision

Implement Transfer Health as `@flicksend/transfer-health`, a pure observer package. It accepts
typed aggregate measurements and returns diagnostics only. `engine-core` may collect its input and
render its output but transfer state machines do not consult it for send, retry, resume, integrity,
or delivery decisions.

## Consequences

Health code cannot import React, WebRTC, filesystem adapters, auth, database, or UI code. A failed
or unavailable diagnostic never changes a transfer outcome. This preserves FSTP correctness and lets
the analyzer have deterministic unit tests independent of browser timing.
