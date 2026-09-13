# P4 Core Send UX

## Purpose

P4 implements the sender-side V1 journey: choose a person, select files or one folder, prepare a bounded
source, review it, send through the existing engine, and complete only after engine `DELIVERED`.
FlickSend remains an internal working brand under `CONTINUE_PENDING_COUNSEL`.

## Sender Journey

1. `/send` presents a compact fixture-backed recipient selector.
2. The sender selects one file, multiple files, or one folder. Mixed file-and-folder transfers are not offered.
3. The product prepares metadata asynchronously. Folder preparation is indeterminate unless enumeration counts
   are available; it never reads payload into an aggregate buffer.
4. The review shows recipient, source name, size, file count, and folder count, with one primary `Send` action.
5. A development-only session handoff connects the deterministic receiver harness. It is not an invitation or
   production recipient-authorization system.
6. The active screen presents engine-derived transfer and receiver-verified progress, trustworthy speed and ETA,
   advisory Transfer Health, and safe cancellation.
7. An interruption preserves transfer identity and verified progress, then returns to transferring after engine
   reconciliation.
8. The completion card appears only for the active transfer after engine `DELIVERED`.

## Recipient And Source Selection

`SendSessionController` receives the synthetic P4 recipient provider; it creates no People database, account,
or relationship state. Presence remains advisory: `Unknown` is displayed as unknown and does not imply an
offline recipient.

The application owns picker calls. A single `File` uses the M5 path. Multiple files are adapted to the existing
StreamPack source with bounded range reads. A selected directory uses the existing browser filesystem/StreamPack
adapter. P4 never zips, flattens, Base64-encodes, or whole-file buffers a source.

`Change files`, `Clear source`, and recipient selection invalidate preparation/session work before transfer
start. A revision and coordinator identity guard stale preparation and snapshots. Source selection respects the
M9 capability truth model; deferred real external Windows picker qualification is not claimed as closed.

## Transfer Presentation

`VerifiedProgress` presents transferred progress separately from receiver-persisted safe progress. It conveys
that completed verified work is safe during supported recovery without exposing logical block counts. Progress,
speed, route labels, and health come from engine snapshots, never React frame counters or timers. ETA is withheld
until the health measurement has high confidence.

The sender sees waiting, connecting, sending, reconnecting, verification, cancellation, and terminal states.
Ordinary product UI does not reveal ICE, SDP, candidates, credentials, or transport traces. `Direct` and `Relayed`
are secondary safe route labels when a prepared route is available.

## Errors And Completion

Source mutation, capability, service, integrity, recovery, and generic errors map to the P1 product taxonomy.
An integrity failure says nothing has been marked complete. Cancellation is distinct from failure and is confirmed
before dispatching existing engine cancellation. Pause is not exposed: P4 has no consistent safe StreamPack pause
contract.

Product completion requires `DELIVERED` from the active engine transfer identity. Sent bytes, 100% progress,
local hashing, or a drained data channel can never produce the completion UI.

## Accessibility And Responsive Behavior

Recipient actions, both picker actions, Send, error reset, and cancel confirmation are keyboard reachable. State
changes use a polite live region; terminal cards receive focus. Native file input remains available to automation
and keyboard users behind visible P3 `DropZone` controls. P4 reuses frozen P3 focus, contrast, dialog, and
reduced-motion behavior.

The sender layout is desktop-first and is reviewed at 1440, 1280, 1024, 768, and 390 CSS pixels. The mobile width
is layout evidence only; it does not qualify mobile transfer support.

## Privacy, Security, And Boundaries

P4 keeps browser file handles and source metadata within existing filesystem/engine abstractions. It adds no
payload persistence, localStorage/sessionStorage/IndexedDB payload cache, product analytics, full paths, or
content logging. Normal payload remains on the WebRTC data path, not the FlickSend application API.

The P4 receiver page is development/test infrastructure with bounded synthetic destinations only. It is not P5
Receive UX. P5 recipient authorization/destination UX, P6 People, P7 history, P8 recovery polish, P9 accessibility
audit, P10 authentication, and later production work remain outside this phase.
