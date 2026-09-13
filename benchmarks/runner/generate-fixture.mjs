import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, statfsSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";

const blockBytes = 8 * 1024 * 1024;
const units = new Map([
  ["kib", 1024],
  ["mib", 1024 ** 2],
  ["gib", 1024 ** 3]
]);

function argument(name) {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  return value?.slice(name.length + 3);
}

function parseSize(value) {
  const match = /^(\d+)(KiB|MiB|GiB)$/i.exec(value ?? "");
  if (!match)
    throw new Error("Use --size=<positive KiB, MiB, or GiB value>, for example --size=1GiB.");
  const bytes = Number(match[1]) * units.get(match[2].toLowerCase());
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("Fixture size is invalid.");
  return bytes;
}

const size = parseSize(argument("size"));
const output = argument("output");
if (!output) throw new Error("Use --output=<local fixture path>.");
const outputPath = resolve(output);
const outputDirectory = dirname(outputPath);
mkdirSync(outputDirectory, { recursive: true });
const filesystem = statfsSync(outputDirectory);
const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
if (availableBytes < size)
  throw new Error(
    `Insufficient disk space: need ${size} bytes, available ${availableBytes} bytes.`
  );

const buffer = Buffer.allocUnsafe(blockBytes);
const hash = createHash("sha256");
const descriptor = openSync(outputPath, "wx");
try {
  for (let offset = 0; offset < size; offset += blockBytes) {
    const length = Math.min(blockBytes, size - offset);
    for (let index = 0; index < length; index += 1) buffer[index] = (offset + index) % 251;
    const chunk = buffer.subarray(0, length);
    writeSync(descriptor, chunk, 0, length, offset);
    hash.update(chunk);
  }
} finally {
  closeSync(descriptor);
}

process.stdout.write(
  JSON.stringify(
    {
      schemaVersion: 1,
      kind: "flicksend-deterministic-fixture",
      pattern: "indexed-byte-mod-251-v1",
      sizeBytes: size,
      blockBytes,
      availableBytesBeforeGeneration: availableBytes,
      sha256: hash.digest("hex"),
      outputPath
    },
    null,
    2
  ) + "\n"
);
