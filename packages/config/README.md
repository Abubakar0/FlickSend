# Shared Configuration Boundary

`@flicksend/config` is a framework-independent, secret-value-free contract for deployment classes,
public signaling URLs, browser origins, public ICE URLs, TURN credential TTLs, and the browser-safe
`ClientIceConfiguration` DTO.

It never loads environment variables, imports Node.js, React, Next.js, Cloudflare APIs, or secrets.
Applications and Workers own configuration loading and keep secret values on their respective server boundaries.
