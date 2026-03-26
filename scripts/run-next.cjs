const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function stripWindowsLongPathPrefix(input) {
  if (typeof input !== "string") {
    return "";
  }

  return input.startsWith("\\\\?\\") ? input.slice(4) : input;
}

function resolveRepoRoot() {
  const packageJsonPath = stripWindowsLongPathPrefix(process.env.npm_package_json || "");

  if (packageJsonPath) {
    return path.dirname(packageJsonPath);
  }

  return path.resolve(__dirname, "..");
}

function escapePowerShellSingleQuoted(input) {
  return String(input).replace(/'/g, "''");
}

function spawnNextOnWindows(repoRoot, args) {
  const command = [
    `$repo = '${escapePowerShellSingleQuoted(repoRoot)}'`,
    'Set-Location -LiteralPath $repo',
    `$nextArgs = @(${args.map((arg) => `'${escapePowerShellSingleQuoted(arg)}'`).join(', ')})`,
    '& node .\\node_modules\\next\\dist\\bin\\next @nextArgs',
  ].join('; ');

  return spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      INIT_CWD: repoRoot,
      PWD: repoRoot,
    },
    stdio: 'inherit',
    windowsHide: false,
  });
}

function runNext(args) {
  const repoRoot = resolveRepoRoot();
  const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

  if (!fs.existsSync(nextBin)) {
    console.error(`Next CLI not found at ${nextBin}`);
    process.exit(1);
  }

  const child = process.platform === 'win32'
    ? spawnNextOnWindows(repoRoot, args)
    : spawn(process.execPath, [nextBin, ...args], {
        cwd: repoRoot,
        env: {
          ...process.env,
          INIT_CWD: repoRoot,
          PWD: repoRoot,
        },
        stdio: 'inherit',
        windowsHide: false,
      });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

if (require.main === module) {
  runNext(process.argv.slice(2));
}

module.exports = { runNext };