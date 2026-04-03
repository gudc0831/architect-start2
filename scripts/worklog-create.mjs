import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function formatDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatClock(date) {
  return `${formatDatePart(date.getHours())}:${formatDatePart(date.getMinutes())}`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${formatDatePart(date.getMonth() + 1)}-${formatDatePart(date.getDate())}`;
}

function formatStamp(date) {
  return `${formatDate(date)}-${formatDatePart(date.getHours())}${formatDatePart(date.getMinutes())}`;
}

function slugify(input) {
  const slug = (input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "worklog";
}

function parseStartClock(value, now) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid --start value "${value}". Use HH:mm.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid --start value "${value}". Use HH:mm.`);
  }

  const start = new Date(now);
  start.setHours(hours, minutes, 0, 0);

  return start;
}

function formatDurationMinutes(totalMinutes) {
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatTimeWindow(start, end) {
  if (!start) {
    return formatClock(end);
  }

  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  return `${formatClock(start)}-${formatClock(end)} (${formatDurationMinutes(durationMinutes)})`;
}

function getStagedFiles() {
  const output = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);

  if (!output) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("docs/worklogs/"));
}

function getDiffTotals() {
  const output = runGit(["diff", "--cached", "--numstat", "--diff-filter=ACMR"]);

  if (!output) {
    return { added: 0, deleted: 0 };
  }

  return output.split(/\r?\n/).reduce(
    (totals, line) => {
      const [addedRaw, deletedRaw] = line.split("\t");
      const added = Number.parseInt(addedRaw, 10);
      const deleted = Number.parseInt(deletedRaw, 10);

      return {
        added: totals.added + (Number.isFinite(added) ? added : 0),
        deleted: totals.deleted + (Number.isFinite(deleted) ? deleted : 0),
      };
    },
    { added: 0, deleted: 0 },
  );
}

function shortenFile(file) {
  return file.length <= 36 ? file : `...${file.slice(-(36 - 3))}`;
}

function summarizeDiff(files, totals) {
  if (files.length === 0) {
    return "no staged files";
  }

  const preview = files.slice(0, 3).map(shortenFile).join(", ");
  const remainder = files.length > 3 ? ` +${files.length - 3}` : "";

  return `${files.length}f +${totals.added}/-${totals.deleted} | ${preview}${remainder}`;
}

function buildFilePath(stamp, slug) {
  const worklogDir = path.join(process.cwd(), "docs", "worklogs");
  fs.mkdirSync(worklogDir, { recursive: true });

  let candidate = path.join(worklogDir, `${stamp}-${slug}.md`);
  let suffix = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(worklogDir, `${stamp}-${slug}-${suffix}.md`);
    suffix += 1;
  }

  return candidate;
}

function stageFile(filePath) {
  runGit(["add", filePath]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const stagedFiles = getStagedFiles();
  const diffTotals = getDiffTotals();
  const slug = slugify(args.slug ?? args.req ?? args.why);
  const filePath = buildFilePath(formatStamp(now), slug);
  const start = parseStartClock(args.start, now);
  const content = [
    `Req: ${args.req ?? "pending"}`,
    `Diff: ${summarizeDiff(stagedFiles, diffTotals)}`,
    `Why: ${args.why ?? "pending"}`,
    `Verify/Time: ${args.verify ?? "pending"} | ${formatTimeWindow(start, now)}`,
  ].join("\n");

  fs.writeFileSync(filePath, `${content}\n`, "utf8");
  stageFile(filePath);

  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  console.log(relativePath);
}

main();
