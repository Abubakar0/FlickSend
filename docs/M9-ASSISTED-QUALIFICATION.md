# M9 Assisted Qualification

Use this procedure only with an actual installed browser and real user interaction. Playwright device
emulation, Playwright WebKit, mocked File System Access handles, and OPFS fixture destinations are
not evidence for these steps.

The Engine Lab export contains aggregate counts, permission states, integrity outcomes, and destination
sizes only. It deliberately excludes file names, paths, transfer IDs, and payload data.

## Windows Primary Desktop

Run one qualification session per browser: Chrome stable, then Edge stable. Use two tabs or profiles
for the sender and receiver. Keep one tab as the evidence tab for all of the following steps.

1. Start the local Engine Lab and signaling service.

```powershell
pnpm --filter @flicksend/signaling dev
pnpm --filter @flicksend/engine-lab dev
```

2. In the sender tab, select a real local file with the ordinary file input, create a session, and
   offer the file. In the evidence tab, join the session and select `Choose Destination and Accept`.
   Choose a new external filesystem file, allow the permission prompt, and wait for `DELIVERED` with a
   verified manifest root. The evidence output must report `finalDestinationMatch: true`.

3. In the evidence tab, start a new session as sender and use `Select Folder` to choose a real external
   directory containing nested folders, an empty directory, a zero-byte file, tiny files, a medium
   file, and an NFD-spelled Unicode filename. Offer it to the other tab. The evidence output must show
   `streamPackManifestBuilt: true` and `canonicalNfcPaths: true`. Inspect the receiver's selected
   destination before continuing; record any platform picker behavior that cannot preserve an empty
   directory.

4. In the sender tab, use `Load M9 Filesystem Fixture`, offer the folder, and join from the evidence
   tab. Select `Choose Folder Destination` and choose a new real external directory. Wait for
   `DELIVERED` and `Folder tree: match`. The fixture includes nested and empty directories, a zero-byte
   file, tiny and medium files, and an NFD input path that StreamPack canonicalizes to NFC. The evidence
   output must report `finalTreeMatch: true`, `fspkRootVerified: true`, and bounded destination handles.

5. Select `Download M9 Assisted JSON` from the evidence tab. Select the exact browser/OS target first:
   `m9-chrome-windows-filesystem` or `m9-edge-windows-filesystem`. Do not edit the JSON and do not add
   paths, file names, or payload values.

6. Retain the record only after a reviewer confirms it describes a real, non-emulated browser session.

```powershell
pnpm qualification:m9:assisted -- --input C:\absolute\path\flicksend-m9-assisted.json
```

The importer requires a passing same-browser core artifact first. It records `PASS` for real filesystem
coverage only when the exported aggregate result includes a matching file destination, folder source,
and exact folder destination tree. Partial records are retained as `PARTIAL`; they never upgrade a
support tier.

## Permission And Lifecycle

Run these actions separately for each primary Windows browser and retain the operator observations with
the imported evidence review. Do not mark a result as supported based on API presence.

| Case                    | Required observation                                                                 | Allowed result                                                       |
| ----------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Permission after picker | `queryPermission()` state at selection and completion                                | `PASS`, `REQUIRES_REPERMISSION`, `NOT_SUPPORTED`, `NOT_TESTED`       |
| Ordinary reconnect      | A selected destination remains writable only if actual behavior proves it            | `PASS`, `REQUIRES_REPERMISSION`, `NOT_TESTED`                        |
| Background tab          | Correctness, DataChannel state, and no false `DELIVERED`                             | `PASS`, `LIMITED`, `NOT_TESTED`                                      |
| Refresh                 | Verified metadata and destination permission behavior after refresh                  | `SUPPORTED_WITH_REPERMISSION`, `NOT_SUPPORTED`, `NOT_TESTED`         |
| Browser restart         | Source handle, destination handle, permissions, and recovery state after relaunch    | `PASS`, `SUPPORTED_WITH_REPERMISSION`, `NOT_SUPPORTED`, `NOT_TESTED` |
| Permission loss         | Explicit filesystem error, no false `DELIVERED`, and safe retained verified progress | `PASS`, `NOT_SUPPORTED`, `NOT_TESTED`                                |
| Sleep or screen lock    | Observed recovery only; continuation is never promised                               | `LIMITED`, `NOT TESTED`                                              |

No result in this table may be inferred from an OPFS fixture, an automated file input, or a mocked
permission response. Wake Lock availability may be recorded, but correctness never depends on it.

## Firefox And macOS

Stable Firefox is not Playwright Firefox. Use an actual Firefox session and the Engine Lab capability
snapshot to identify safe modes. If a streaming external destination is unavailable, do not introduce a
Blob or OPFS payload fallback; retain an explicit limitation or block the unsafe receive mode.

Run `pnpm qualification:m9:macos` on a real Mac for Chrome and Firefox. Safari must be tested in real
Safari on macOS through this assisted procedure, not Playwright WebKit. macOS filesystem semantics,
Unicode normalization, case collisions, picker permissions, and resume behavior are independent of
Windows and must not be inferred from this document.

Android Chrome and iOS/iPadOS Safari are `NOT TESTED` and `NOT YET QUALIFIED`. Real-device evidence
is required before any mobile support claim; mobile viewport emulation cannot populate a support tier.
