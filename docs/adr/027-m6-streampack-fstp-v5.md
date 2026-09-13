# ADR-027: StreamPack virtual folders and FSTP v5

## Status

Accepted.

## Decision

M6 adds a separate FSTP v5 transfer kind for StreamPack folders. The selected root directory is
recreated below the receiver-selected destination. The folder is not zipped or buffered as an
archive. Metadata is enumerated before payload, normalized to portable NFC slash paths, sorted by
UTF-8 byte order, and assigned sequential file IDs after sorting. Any case-fold collision, invalid
portable path, unsupported entry, or malformed layout is rejected rather than renamed.

Files form one virtual contiguous byte stream. An indexed file-start table maps a logical offset by
binary search. Fixed 8 MiB logical blocks may cross file boundaries, so tiny files share normal
block acknowledgements and never cause per-file offer/accept cycles. V5 sends bounded manifest
entry chunks, at most 128 entries and 12 KiB serialized metadata, before STREAMPACK_READY.

The canonical binary FSPK root binds the schema, SHA-256, selected-root semantics, ordered
entries, path bytes, entry IDs, file IDs, file sizes, logical-block settings, and ordered block
digests. Receiver writes are positional and range-mapped; a block becomes committed only after all
of its writes, its digest, and the verified checkpoint persist. Browser destination writers use a
16-handle LRU cache. Existing verified checkpoints require re-hashing persisted logical blocks
from the selected destination before reuse.

## Consequences

FSTP v4 single-file M5 remains unchanged. FSTP v5 peers must reject unknown StreamPack messages
explicitly. The M6 browser implementation supports File System Access API directory handles;
legacy upload inputs cannot provide the same directory-handle destination semantics. Permissions,
ACLs, ownership, symlinks, and extended attributes are not transferred.
