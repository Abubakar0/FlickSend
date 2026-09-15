# P11 Persistence Boundaries

## Database And Engine

`engine-core` and every engine package remain database-independent. PostgreSQL cannot carry payload bytes, choose a
route, schedule resends, decide integrity, persist verified block maps, write files, or convert product progress to
delivery. Only engine `DELIVERED` for the active identity permits a history transition to `COMPLETED`.

## Database And Clerk

Clerk proves the signed-in principal. The server-side P11 account service maps that principal's private provider
subject to one durable FlickSend Account. Client authority never comes from display name, email, query parameters,
or client state. Clerk is still the source of own-account email presentation; P11 stores no email.

## Database And People/Transfers

P11 replaces only real-account P6/P7 process-local repositories. Fixture routes remain explicitly development/test
only. Production People has a truthful empty state and no P11 pairing creation UI; production invitations and
delivery begin no earlier than P12. Persistent transfer history is observational and owner-scoped. Guest Receive is
unchanged and does not require account creation or a database write.

## Database And P12

PostgreSQL does not store invitations, pairing codes, invite links, email delivery, SDP, ICE candidates, DataChannel
traffic, signaling messages, or TURN credentials. P12 owns production invitation and signaling infrastructure.

## Database And P15/P18

P11 provides no account deletion, retention schedule, purge, backup/restore claim, analytics, or observability.
Account/product-data deletion coordination is P15. Production observability is P18.

## Outage Behavior

An absent or unreachable `DATABASE_URL` cannot activate fixture repositories or silently display an empty database.
Authenticated product routes show a generic persistence-unavailable state; APIs return safe category errors without
SQL, table, constraint, host, credential, connection string, or Prisma details.
