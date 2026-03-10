# Git Workflow

This project is designed for code sync through GitHub while keeping local data and uploads out of Git.

## Current Repository State

- Remote `origin` is set to `https://github.com/gudc0831/architect-start2.git`
- `main` tracks `origin/main`
- Local Git defaults in this clone:
  - `pull.rebase=true`
  - `rebase.autoStash=true`
  - `fetch.prune=true`
  - `push.autoSetupRemote=true`

## Important Rule

Do not move this exact repository folder between different Windows accounts or automation users.

Use one fresh clone per machine, under the actual Windows user account that will run Git.

Recommended path example:

```powershell
D:\work\architect-start2
```

Avoid paths controlled by sync tools or temporary automation sandboxes.

## First-Time Setup On A New Machine

1. Install Git and Node.js.
2. Open PowerShell as your normal Windows user.
3. Clone the repo into a user-owned folder.

```powershell
git clone https://github.com/gudc0831/architect-start2.git D:\work\architect-start2
cd D:\work\architect-start2
git switch main
git pull --rebase origin main
```

4. Set your identity if needed.

```powershell
git config user.name "Your Name"
git config user.email "you@example.com"
```

5. Create local-only runtime files.

```powershell
Copy-Item .env.example .env.local
```

## Files That Stay Local

These are intentionally excluded from Git:

- `.env.local`
- `.env`
- `uploads`
- `.data`
- `.next`
- `node_modules`

This means code sync and local working data are separate by design.

## Daily Workflow

Before starting work on any machine:

```powershell
git switch main
git pull --rebase origin main
```

For feature work:

```powershell
git switch -c feat/short-topic
```

For design-only experiments:

```powershell
git switch -c design/short-topic
```

Keep those branches short-lived. Merge back quickly and delete them after push/merge.

Before changing machines:

```powershell
git status
git add .
git commit -m "Short clear message"
git push
```

When resuming on another machine:

```powershell
git switch main
git pull --rebase origin main
```

If you were working on a branch:

```powershell
git switch feat/short-topic
git pull --rebase origin feat/short-topic
```

## Conflict Avoidance Rules

- Always pull before starting work on a different machine.
- Do not edit the same branch in parallel on two machines without pulling first.
- Do not store uploads, JSON working data, or secrets in Git.
- Do not keep long-running design branches.
- Prefer `main` plus short branches over many permanent branches.

## If Git Starts Acting Strange

Check these first:

```powershell
git status -sb
git remote -v
git branch -vv
```

If `.git/config` write errors appear again, the clone is owned by the wrong Windows user or process.

In that case, do not keep repairing the broken clone. Create a fresh clone under your own Windows account and continue there.