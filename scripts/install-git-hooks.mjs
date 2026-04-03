import { execFileSync } from "node:child_process";

function main() {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

main();
