# Domain Strategy Research

## Exact Domain Status

`flicksend.com` is **REGISTERED**. The Verisign RDAP response checked at
`2026-09-10T17:53:42.953+05:00` returns a domain object with historical registration and current
expiration events. It does not say the domain is for sale, give a sale price, or establish that it can be
acquired. See [the RDAP record](https://rdap.verisign.com/com/v1/domain/flicksend.com).

## Historical Use And Current Website Status

Public Wayback captures inspected at `2026-09-10T17:54:54.278+05:00` show a 2011 registrar parking page
and 2013-2014 managed-domain pages. P2 recovered no historical FlickSend product site from those captures.
That is historical domain evidence only, not proof of rights or ownership.

The current domain has DNS delegation and resolution, but the HTTPS request observed during P2 failed
certificate validation because the certificate was expired. It is therefore **not validated as an active
website**. A non-working site does not make a registered domain available, and DNS/website operation does
not determine registration or acquisition status.

## Candidate Domains

At `2026-09-10T17:56:46.976+05:00`, RDAP returned no domain object for the candidates below. This is a
time-bound registration signal, not a checkout guarantee; recheck with a reputable registrar immediately
before any authorized acquisition.

| Candidate          | RDAP finding    | Brand clarity | Trust | Typing | Recommendation                                                                                                      |
| ------------------ | --------------- | ------------: | ----: | -----: | ------------------------------------------------------------------------------------------------------------------- |
| `flicksend.app`    | No object found |             5 |     4 |      5 | **Conditional primary** if counsel approves the working brand and live checkout confirms registration availability. |
| `flicksend.io`     | No object found |             5 |     3 |      5 | Secondary: strong for technical users but less neutral for the broader creative-professional V1.                    |
| `flicksend.net`    | No object found |             4 |     3 |      5 | Defensive/secondary option, not the preferred public identity.                                                      |
| `flicksend.co`     | No object found |             4 |     2 |      4 | Rejected as primary due to `.com` typo/confusion risk.                                                              |
| `getflicksend.com` | No object found |             3 |     3 |      3 | Rejected as primary: it looks less canonical and the root `.com` belongs to another party.                          |
| `useflicksend.com` | No object found |             3 |     3 |      3 | Rejected as primary for the same reason.                                                                            |
| `flicksendhq.com`  | No object found |             2 |     2 |      3 | Rejected: unnecessary suffix and weaker product clarity.                                                            |

## Domain Decision

**PRIMARY DOMAIN RECOMMENDATION:** conditional `flicksend.app` only after counsel approves continued use
of the working brand and a current registrar checkout confirms availability.

**SECONDARY / DEFENSIVE OPTIONS:** conditional `flicksend.io` and `flicksend.net`; acquire only if a later
approved brand-protection strategy justifies the cost. P2 does not recommend broad defensive purchasing.

**REJECTED OPTIONS:** `flicksend.co`, `getflicksend.com`, `useflicksend.com`, and `flicksendhq.com` as the
primary public domain. The exact `.com` is **REGISTERED — ACQUISITION MAY BE POSSIBLE**, but P2 does not
claim that it is offered, affordable, or advisable to acquire.

## Future Security Requirements

For any domain later authorized for acquisition: use a dedicated secure registrar account with hardware or
app-based 2FA, registrar lock, auto-renewal, least-privilege access, DNSSEC where supported and appropriate,
certificate automation, and documented recovery contacts. Establish SPF, DKIM, and DMARC only when email is
actually introduced. Do not expose registrar credentials, personal registrant information, or DNS secrets in
repository evidence.

## P2 Boundary

No domain was purchased, transferred, claimed, or configured in P2.
