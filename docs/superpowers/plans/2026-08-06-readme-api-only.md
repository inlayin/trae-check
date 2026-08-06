# README API-only Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale Webview documentation and accurately describe API-only sign-in.

**Architecture:** This is a Markdown-only cleanup confined to `README.md`. The feature list, sign-in mode section, FAQ, and changelog are made consistent with the application's API-only behavior.

**Tech Stack:** Markdown

---

### Task 1: Remove obsolete Webview documentation

**Files:**
- Modify: `README.md` (feature list, sign-in mode section, FAQ, and changelog)
- Test: `README.md` content inspection

- [x] **Step 1: Identify all Webview references**

Run: `Select-String -Path README.md -Pattern 'Webview|webview'`

Expected: matches in the feature list, sign-in mode section, FAQ, and changelog.

- [x] **Step 2: Make the README API-only**

Remove the Webview feature-list entry and its FAQ. In the sign-in section, remove the `Webview 模式（推荐）` subsection and keep `API 模式` as the single mode description. Change the changelog entry from `支持 Webview 和 API 两种签到模式` to `支持 API 签到模式`.

- [x] **Step 3: Verify documentation consistency**

Run: `Select-String -Path README.md -Pattern 'Webview|webview'; Select-String -Path README.md -Pattern '#### API 模式|支持 API 签到模式'`

Expected: the first command has no output; the second command shows the API mode heading and API-only changelog entry.

- [x] **Step 4: Review the patch**

Run: `git diff --check; git diff -- README.md`

Expected: no whitespace errors and only the intended Webview-removal documentation edits.

- [x] **Step 5: Commit the README update**

```bash
git add README.md
git commit -m "docs: remove Webview instructions"
```
