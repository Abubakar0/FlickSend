import {
  createStreamPackManifest,
  StreamPackLayout,
  type StreamPackSource
} from "@flicksend/stream-pack";

const structuralBytes = Uint8Array.from([7, 19, 43, 71, 101, 131, 167, 197]);

function createFixtureSource(input: {
  name: string;
  bytes: number;
  mutable?: { changed: () => boolean };
  readDelayMs?: number;
}): StreamPackSource {
  const manifest = createStreamPackManifest({
    blockBytes: 8 * 1024 * 1024,
    entries: [
      { type: "DIRECTORY", relativePath: input.name },
      { type: "DIRECTORY", relativePath: `${input.name}/Assets` },
      { type: "DIRECTORY", relativePath: `${input.name}/Empty` },
      { type: "FILE", relativePath: `${input.name}/Assets/camera-a.mov`, sizeBytes: input.bytes },
      { type: "FILE", relativePath: `${input.name}/Assets/audio.wav`, sizeBytes: 3 },
      { type: "FILE", relativePath: `${input.name}/Empty/notes.txt`, sizeBytes: 0 }
    ]
  });
  const layout = new StreamPackLayout(manifest);
  return {
    manifest,
    layout,
    async assertUnchanged() {
      if (input.mutable?.changed()) throw new Error("FS_STREAMPACK_SOURCE_CHANGED");
    },
    async read(offset, length) {
      if (input.readDelayMs)
        await new Promise<void>((resolve) => setTimeout(resolve, input.readDelayMs));
      const output = new Uint8Array(length);
      for (const range of layout.ranges(offset, length)) {
        const destinationOffset = range.streamOffset - offset;
        for (let index = 0; index < range.length; index += 1) {
          const absolute = range.fileOffset + index;
          output[destinationOffset + index] =
            range.fileId === 0
              ? structuralBytes[absolute]!
              : input.bytes === structuralBytes.byteLength
                ? structuralBytes[absolute % structuralBytes.byteLength]!
                : (absolute * 31 + 17) % 251;
        }
      }
      return output;
    }
  };
}

/** Small mixed hierarchy used only by the P4 browser sender qualification. */
export function createP4StructuralFolderFixture(): StreamPackSource {
  return createFixtureSource({ name: "Project Footage", bytes: structuralBytes.byteLength });
}

/** Three logical blocks make the controlled recovery state visible without a large fixture. */
export function createP4RecoveryFolderFixture(): StreamPackSource {
  return createFixtureSource({
    name: "Recovery Footage",
    bytes: 32 * 1024 * 1024,
    // Qualification-only pacing leaves a verified block observable before the interruption.
    readDelayMs: 1_000
  });
}

export function createP4MutableFolderFixture(): { source: StreamPackSource; mutate: () => void } {
  let changed = false;
  return {
    source: createFixtureSource({
      name: "Mutable Footage",
      bytes: 8 * 1024 * 1024,
      mutable: { changed: () => changed }
    }),
    mutate() {
      changed = true;
    }
  };
}

export function p4StructuralFixtureTree(): {
  manifest: ReturnType<typeof createP4StructuralFolderFixture>["manifest"];
  files: ReadonlyMap<number, Uint8Array>;
} {
  const source = createP4StructuralFolderFixture();
  return {
    manifest: source.manifest,
    files: new Map([
      [0, structuralBytes.slice(0, 3)],
      [1, structuralBytes],
      [2, new Uint8Array()]
    ])
  };
}
