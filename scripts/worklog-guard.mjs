import { execFileSync } from "node:child_process";

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function getStagedFiles() {
  const output = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);

  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readStagedFile(file) {
  return runGit(["show", `:${file}`]);
}

function isCompactWorklog(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 4 || lines.length > 5) {
    return false;
  }

  if (!/^Req:\s+\S+/.test(lines[0])) {
    return false;
  }

  if (!/^Diff:\s+\S+/.test(lines[1])) {
    return false;
  }

  if (!/^Why:\s+\S+/.test(lines[2])) {
    return false;
  }

  if (!/^(Verify:|Verify\/Time:)\s+\S+/.test(lines[3])) {
    return false;
  }

  if (lines[4] && !/^Time:\s+\S+/.test(lines[4])) {
    return false;
  }

  return true;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const stagedFiles = getStagedFiles();
  const stagedWork = stagedFiles.filter((file) => !file.startsWith("docs/worklogs/"));

  if (stagedWork.length === 0) {
    return;
  }

  const stagedLogs = stagedFiles.filter(
    (file) => file.startsWith("docs/worklogs/") && file.endsWith(".md"),
  );

  if (stagedLogs.length === 0) {
    fail(
      [
        "Commit blocked: stage one compact worklog under docs/worklogs/.",
        "Run: npm run worklog:new -- --slug short-topic --req \"...\" --why \"...\" --verify \"...\" --start 09:40",
      ].join("\n"),
    );
  }

  const hasValidLog = stagedLogs.some((file) => isCompactWorklog(readStagedFile(file)));

  if (!hasValidLog) {
    fail(
      [
        "Commit blocked: staged worklog must stay within 4-5 non-empty lines.",
        "Required order:",
        "Req:",
        "Diff:",
        "Why:",
        "Verify/Time:",
      ].join("\n"),
    );
  }
}

main();
