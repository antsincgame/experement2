#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(agentRoot, "scripts", "smoke-runtime.ts");

const result = spawnSync("npx", ["tsx", script], {
  cwd: agentRoot,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status === 0 ? 0 : 1);
