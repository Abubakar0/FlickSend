import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";

const preset =
  process.argv.find((value) => value.startsWith("--preset="))?.slice(9) ?? "structural";
const output = resolve(
  process.argv.find((value) => value.startsWith("--output="))?.slice(9) ??
    "benchmarks/fixtures/m6-" + preset
);
const profiles = {
  structural: { files: 50, directories: 10, maximumBytes: 64 * 1024 },
  "tiny-many": { files: 10_000, directories: 100, maximumBytes: 32 * 1024 },
  mixed: { files: 1_000, directories: 50, maximumBytes: 8 * 1024 * 1024 },
  large: { files: 32, directories: 8, maximumBytes: 64 * 1024 * 1024 }
};
const profile = profiles[preset];
if (!profile) throw new Error("Unknown fixture preset: " + preset);

function bytesFor(index, length) {
  const seed = createHash("sha256")
    .update("flicksend-m6-" + preset + "-" + index)
    .digest();
  const output = Buffer.allocUnsafe(length);
  for (let offset = 0; offset < length; offset += 1)
    output[offset] = seed[offset % seed.length] ^ (offset & 255);
  return output;
}
async function writeDeterministic(path, index, length) {
  await mkdir(dirname(path), { recursive: true });
  if (length === 0) return writeFile(path, Buffer.alloc(0));
  await new Promise((resolveWrite, reject) => {
    const stream = createWriteStream(path);
    let remaining = length;
    let offset = 0;
    stream.on("error", reject);
    stream.on("finish", resolveWrite);
    function next() {
      while (remaining > 0) {
        const size = Math.min(64 * 1024, remaining);
        remaining -= size;
        if (!stream.write(bytesFor(index + offset, size))) return stream.once("drain", next);
        offset += 1;
      }
      stream.end();
    }
    next();
  });
}

await rm(output, { recursive: true, force: true });
for (let index = 0; index < profile.directories; index += 1)
  await mkdir(
    join(output, "level-0", "level-1", "level-2", "dir-" + String(index).padStart(5, "0")),
    { recursive: true }
  );
for (let index = 0; index < profile.files; index += 1) {
  const directory = join(
    output,
    "level-0",
    "level-1",
    "level-2",
    "dir-" + String(index % profile.directories).padStart(5, "0")
  );
  const size = index % 11 === 0 ? 0 : 16 * (1 << (index % 12));
  await writeDeterministic(
    join(directory, "file-" + String(index).padStart(6, "0") + ".bin"),
    index,
    Math.min(size, profile.maximumBytes)
  );
}
await writeFile(
  join(output, ".flicksend-fixture.json"),
  JSON.stringify({ preset, ...profile }, null, 2)
);
console.log(JSON.stringify({ preset, output, ...profile }));
