# Git snapshots & branches — a plain-language guide

> **Context:** the repo owner is new to git branching. This guide explains, in
> beginner terms, the two-snapshot setup and the everyday commands. Keep it
> simple; when in doubt, `git checkout main` returns to the safe deployed version.

## The two snapshots

Two branches were created on 2026-09-18. Each is a complete copy of the project;
only `templates/landing.html` + `static/css/landing.css` differ between them.

```
main             → Snapshot 1: current codebase (original coverage meter-card landing)  ← DEPLOYED
updated-landing  → Snapshot 2: same code + the card-redesign landing (centred glass panel)
```

The card-redesign source of truth is also parked outside the repo at
`../_card_design_wip/*.cardwip`.

## What a branch is

A branch is a **named save-point timeline**. `git checkout <name>` swaps **every
file on disk** to that version instantly.

## Switch between the two snapshots

```bash
git checkout updated-landing   # disk becomes the card-redesign landing
git checkout main              # disk becomes the current/meter-card landing
```

Commit or discard your current edits **before** switching, or git will stop you.
Check state anytime with `git status`.

## Make changes to either one

Edits land on whatever branch you're currently on:

```bash
git checkout main              # 1. pick which snapshot to edit
# ...edit files...
git add -A                     # 2. stage the changes
git commit -m "what you did"   # 3. save them — onto THIS branch only
```

A commit on `main` does not affect `updated-landing`, and vice-versa.

## How this affects GitHub

**Local commits do not touch GitHub until you push.** After the snapshots were
made, `main` was reported as *"ahead 56"* — 56 local commits GitHub hadn't seen.

```bash
git push origin main               # publish main
git push origin updated-landing    # publish the other branch (creates it on GitHub)
```

## Rolling back

| Goal | Command |
|------|---------|
| Undo unsaved edits to one file | `git restore <file>` |
| Undo all unsaved edits | `git restore .` |
| Jump back to a snapshot | `git checkout main` |
| Undo a commit but keep a record | `git revert <commit-id>` |
| Hard reset to a commit (destroys uncommitted work) | `git reset --hard <commit-id>` |

## Deploy a specific version

Deploy ships whatever files are currently checked out:

```bash
git checkout updated-landing
gcloud run deploy scholarship-agent-42 --source . --project=project-8dde1e00-67da-41c1-9d9 --region=asia-south1 --quiet
git checkout main   # switch back afterwards
```

## Preview both at once (locally)

One `python app.py` serves one branch. To see both simultaneously, run a second
server from a **git worktree** (a second folder checked out to the other branch):

```bash
git worktree add ../a42-updated-landing updated-landing   # second folder on the other branch
cp .env ../a42-updated-landing/.env                       # .env is git-ignored, copy it in
cd ../a42-updated-landing
../scholarship-agent/.venv/Scripts/python.exe -c "import app; app.app.run(host='127.0.0.1', port=5001)"
```

Then: `main` → http://127.0.0.1:5000 · `updated-landing` → http://127.0.0.1:5001.
Remove the worktree later with `git worktree remove ../a42-updated-landing`.

## Later: merge the card landing into main

```bash
git checkout main
git merge updated-landing    # brings its landing changes into main
```
