import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function resolveNpmCliPath() {
  const npmExecPath = process.env.npm_execpath;
  const candidates = [
    npmExecPath,
    npmExecPath ? join(dirname(npmExecPath), "npm-cli.js") : null,
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ];

  for (const candidate of candidates) {
    if (candidate && /npm-cli\.js$/i.test(candidate) && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to locate npm-cli.js. Run this command through an npm script.");
}

function npmExecArgs(args: string[]) {
  return [resolveNpmCliPath(), "exec", "--", ...args];
}

export function captureNpmExec(args: string[]) {
  const result = spawnSync(process.execPath, npmExecArgs(args), {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

export function runCheckedNpmExec(args: string[]) {
  const result = spawnSync(process.execPath, npmExecArgs(args), {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed: npm exec -- ${args.join(" ")}`);
  }
}
