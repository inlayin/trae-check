# README pnpm Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the README consistently instruct developers to use pnpm.

**Architecture:** This is a documentation-only change in the quick-start section. It changes no package scripts, dependencies, lockfiles, or application code.

**Tech Stack:** Markdown, pnpm

---

### Task 1: Standardize quick-start instructions

**Files:**
- Modify: `README.md` (environment requirements and quick-start command blocks)
- Test: `README.md` content inspection

- [x] **Step 1: Confirm the existing npm-based instructions are present**

Run: `Select-String -Path README.md -Pattern '\bnpm\b|\byarn\b'`

Expected: matches for the environment requirement, `npm install`, `npm run dev`, and `npm run build`.

- [x] **Step 2: Replace the package-manager requirement and commands**

Replace the following README fragments:

```markdown
- npm or yarn
```

with:

```markdown
- pnpm
```

Replace `npm install`, `npm run dev`, and `npm run build` with `pnpm install`, `pnpm dev`, and `pnpm build`, respectively.

- [x] **Step 3: Verify the README uses pnpm consistently**

Run: `Select-String -Path README.md -Pattern '\bnpm\b|\byarn\b'; Select-String -Path README.md -Pattern 'pnpm install|pnpm dev|pnpm build'`

Expected: the first command has no output; the second command shows all three pnpm commands.

- [x] **Step 4: Review the patch for formatting-only changes**

Run: `git diff --check; git diff -- README.md`

Expected: no whitespace errors and only the intended package-manager wording changes.

- [x] **Step 5: Commit the documentation update**

```bash
git add README.md
git commit -m "docs: use pnpm in setup instructions"
```
