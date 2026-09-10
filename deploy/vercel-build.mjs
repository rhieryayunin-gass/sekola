import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Preview builds use the same public application endpoints. Project-scoped
// environment values always win; no privileged keys are stored in this file.
if (process.env.VERCEL_ENV === "preview") {
  const defaults = JSON.parse(readFileSync(new URL("./osekola/public-web-config.json", import.meta.url), "utf8"));
  for (const [name, value] of Object.entries(defaults)) process.env[name] ??= value;
}

// Vercel's Git identity is the source of truth; CLI builds may set RELEASE_SHA.
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RELEASE_SHA;
if (!release) throw new Error("Enable Vercel system environment variables or set RELEASE_SHA for a CLI build");
process.env.RELEASE_SHA = release;
await import("./validate-web-env.mjs");
const result = spawnSync("pnpm", ["exec", "next", "build"], {
  cwd: fileURLToPath(new URL("../apps/web", import.meta.url)),
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
