# TURN Firewall Requirements

Expose only the coturn listener and relay ports required by the production compose template:

- `3478/udp` for TURN/STUN over UDP.
- `3478/tcp` for TURN/STUN over TCP.
- `49160-49200/udp` for relay allocations.
- `49160-49200/tcp` for relay allocations.

Restrict SSH and any host administration port to the deployment operator's allowlist. Do not expose the
coturn CLI; the configuration uses `no-cli`. Keep the operating system firewall, cloud firewall, and
container port mapping aligned. Verify that the selected host supports public UDP, public TCP, and the
complete relay range before choosing it; Railway suitability for public TURN is unproven.

TURNS/TLS is **NOT QUALIFIED**. Do not open `5349` or claim TLS support until an approved public
hostname, valid certificate, listener configuration, and external relay qualification are complete.

coturn operational logs and network metadata must not be copied into FlickSend product storage,
analytics, support payloads, or browser diagnostics. Retain and access host logs only under the hosting
provider's operational and privacy controls.
