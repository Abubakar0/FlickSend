# Database Package Boundary

`@flicksend/database` owns Prisma configuration, committed PostgreSQL migrations, and the
server-only Prisma client lifecycle. It stores only P11 metadata/control-plane records.

It never stores payload bytes, filenames, paths, manifests, block maps, engine transfer IDs,
signaling data, WebRTC data, or TURN credentials. Engine packages must never depend on it.
