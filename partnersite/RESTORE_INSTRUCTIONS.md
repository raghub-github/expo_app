# Restore Code Before `git reset --hard origin/main`

## What your reflog shows

- **main** (and **origin/main**) is at commit **84403d6** ("updates"). This commit already includes:
  - Refund policy page (`src/app/refund-policy/page.tsx`)
  - Auth/login page UI (`src/app/auth/page.tsx`)
  - Store settings UI (`src/app/mx/store-settings/page.tsx`)
  - Plus invoice/withdrawal, menu, payments, profile, etc.

- Before the reset, **main** had also been at **9b64f65** ("all set") and **9a046b0** ("address") at different times. The latest **origin/main** is **84403d6**, which is ahead of 9b64f65.

## Option A – Get back to **origin/main** (84403d6) – recommended

This is the same as “the code right before you ran `git reset --hard origin/main`” if you had no local commits and no uncommitted changes. It has refund page, main pages, and settings/login UI.

```bash
git checkout main
git fetch origin
git reset --hard origin/main
```

You will be on **main** at commit **84403d6** with the refund, auth, and store-settings code.

## Option B – Get back to an older “main” state (9b64f65 "all set")

If you want the state of **main** from when it was at **9b64f65** (before the “address” and “updates” commits):

```bash
git checkout main
git reset --hard 9b64f65
```

Warning: this removes the “address” and “updates” commits from your local **main**. Only do this if you are sure you want that older snapshot.

## If you had uncommitted changes

`git reset --hard` removes uncommitted changes. Git did not report any dangling commits (`git fsck --lost-found` was empty), so uncommitted edits are not recoverable from Git. If you need those again, they would have to be recreated or restored from backups/IDE history.

## Current state

- You are in **detached HEAD** at **a83cc61** (“feature work done”), which is the same as **84403d6** (no extra commits on top).
- To leave detached HEAD and use **main** at **origin/main** (84403d6): run the commands in **Option A** above.
