# P13 Environment Contract

The shared `@flicksend/config` package validates environment class, Worker URL, exact allowed origins,
and browser ICE URL lists before infrastructure code consumes them.

| Name                                   | Owner                                   | Rules                                                                   |
| -------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| `ENVIRONMENT`                          | Cloudflare Worker variable              | exactly `development`, `staging`, or `production`                       |
| `EXPECTED_ORIGINS`                     | Cloudflare Worker variable              | comma-separated exact HTTPS origins; loopback HTTP only for development |
| `BUILD_VERSION`                        | Cloudflare Worker variable              | bounded safe operational version                                        |
| `SIGNALING_CAPABILITY_SECRET`          | Cloudflare/Railway server secret        | minimum 32 bytes; never serialized to a client                          |
| `NEXT_PUBLIC_PRODUCTION_SIGNALING_URL` | Engine Lab/Railway public configuration | credential-free `wss:` root with no path, query, or hash                |

The public Worker URL is the single signaling authority location. Railway derives the corresponding
server-only `https:` relay eligibility endpoint deterministically. It does not trust a second endpoint
configuration supplied by a browser or product route.

Invalid values fail closed with generic availability behavior. They are not silently normalized into a
different environment or origin.
