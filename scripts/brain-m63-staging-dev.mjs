import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const ENV_PATH = ".env.m63-smoke.local";
const PRODUCTION_PROJECT_REF = "cibwzxzqomddhjbxoxeg";

const parseEnvFile = (content) => {
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 1) throw new Error(`Invalid line in ${ENV_PATH}.`);
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
};

const stagingEnv = parseEnvFile(readFileSync(ENV_PATH, "utf8"));
const url = new URL(stagingEnv.NEXT_PUBLIC_URSO_SUPABASE_URL ?? "");
const projectRef = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];

if (!projectRef || projectRef === PRODUCTION_PROJECT_REF) {
  throw new Error("Refusing to launch the staging Brain against production.");
}
if (
  projectRef !== stagingEnv.BRAIN_STAGING_PROJECT_REF ||
  stagingEnv.BRAIN_STAGING_CONFIRM !== "m63-smoke"
) {
  throw new Error("The M6.3 staging URL, project ref, or confirmation does not match.");
}

const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? process.argv[portIndex + 1] : "3013";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", port],
  {
    cwd: process.cwd(),
    env: { ...process.env, ...stagingEnv },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
