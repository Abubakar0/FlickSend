# P14 TURN Deployment

Use the provider-neutral templates in [`../infra/turn`](../infra/turn/README.md) only on a dedicated
public coturn host after reviewing firewall, public address mapping, host hardening, and secret
management. Railway is the credential issuer; it is not approved as the public coturn host.

The host requires a deployment-local realm, public external IP mapping, and a high-entropy shared
secret. Do not commit, paste, log, or expose those values to browser code. Open only UDP/TCP `3478` and
UDP/TCP `49160-49200`, while restricting host administration access separately.

TLS/TURNS is **NOT QUALIFIED**. Do not configure or advertise it until an approved public hostname,
certificate, listener configuration, and external browser relay test are available. The included
template deliberately disables TLS/DTLS to prevent an unsupported claim.
