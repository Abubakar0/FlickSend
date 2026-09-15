# P13/P14 Integration Report

P13 and P14 share only a narrow server-to-server relay eligibility boundary. P13 remains the
cryptographic signaling authority; P14 Railway verifies the capability locally, attaches a
domain-separated proof, and receives only a safe eligibility category. P14 then returns a prepared
ephemeral ICE DTO to the browser. No payload, transfer identity, account subject, coturn secret,
session diagnostic, candidate, SDP, or route-control primitive crosses into product state.

The P14 ICE-provider interface accepts capability-authorized signaling sessions without a legacy
six-digit session code. The legacy HTTP credential provider still requires its session code; this
compatibility correction preserves the M7 fixture path and avoids placing capability or Railway logic
inside `engine-core`.

## Evidence Status

- P13 repository implementation: pending final verification; external persistent Cloudflare staging:
  blocked.
- P14 repository implementation: pending final verification; external public coturn: blocked.
- No database migration was added.
- FSTP, integrity, StreamPack, transfer identity, payload transport, and M4-M10 qualification logic
  were not redesigned or rerun by this infrastructure work.

P15+ scope was not started.
