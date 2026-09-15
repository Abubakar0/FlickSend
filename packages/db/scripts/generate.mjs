import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("..", import.meta.url));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

// Client generation reads Prisma's config but never opens this fallback connection.
const generationUrl =
  process.env.DATABASE_URL ?? "postgresql://localhost/flicksend_generation_only";
const result = spawnSync(
  pnpmCommand,
  ["exec", "prisma", "generate", "--config", "prisma.config.ts"],
  {
    cwd: packageDirectory,
    env: { ...process.env, DATABASE_URL: generationUrl },
    shell: process.platform === "win32",
    stdio: "inherit"
  }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
