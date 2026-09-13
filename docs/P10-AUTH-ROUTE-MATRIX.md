# P10 Authentication Route Matrix

| Route                 | Signed out              | Signed in                                                      | Authority                                     |
| --------------------- | ----------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `/sign-in`            | Public                  | Provider-appropriate redirect/state                            | Clerk                                         |
| `/sign-up`            | Public                  | Provider-appropriate redirect/state                            | Clerk                                         |
| `/send`               | Sign in required        | Allowed; recipient data remains unavailable pending P11        | `AuthPrincipal` plus P6 recipient eligibility |
| `/people`             | Sign in required        | Allowed; production People remains unavailable pending P11/P12 | `AuthPrincipal`                               |
| `/transfers`          | Sign in required        | Allowed; production history remains unavailable pending P11    | `AuthPrincipal`                               |
| `/transfers/[record]` | Sign in required        | Allowed; no P11 ownership claim is made                        | `AuthPrincipal` plus P7 boundary              |
| `/account`            | Sign in required        | Allowed                                                        | `AuthPrincipal`                               |
| `/receive/[session]`  | Public if P5-authorized | Public if P5-authorized                                        | P5 transfer authorization                     |

The route guard is server-side. UI visibility and client presentation do not establish access. P10 does not claim a
production database ownership check because P11 has not implemented a durable FlickSend account or history record.

## Development Qualification Exception

An explicit non-production Engine Lab fixture may deterministically map a synthetic fixture principal to P6/P7
state. It is not a production route mode. In production `?as=` and fixture controls cannot select an account, and
development People/Transfers APIs return unavailable.
