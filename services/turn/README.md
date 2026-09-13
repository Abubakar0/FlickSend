# M7 coturn Qualification Service

The M7 local qualification service uses `coturn/coturn:4.17.2-r0`, coturn REST shared-secret
credentials, UDP/TCP listener port `3478`, and the bounded relay range `49160-49200`. The browser
only receives short-lived username/password credentials from the signaling worker; it never receives
the shared secret.

Run `pnpm qualification:m7`. The runner creates a temporary `.m7.env`, starts this compose service,
provisions the signaling worker's temporary `.dev.vars`, runs the M7 Playwright suite, then tears
down the service and deletes generated secrets. It refuses to overwrite an existing signaling
`.dev.vars` file.

This compose service is development-only. It deliberately disables TLS/DTLS because `localhost` has
no production certificate. A production deployment needs public routable IP mapping, a trusted
certificate for TURN/TLS, firewall rules for the full relay range, rate limiting, monitoring, log
redaction, secret rotation, and a separately documented infrastructure plan.
