import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(directory, "..");
const source = resolve(packageRoot, "src", "styles.css");
const destination = resolve(packageRoot, "dist", "styles.css");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
