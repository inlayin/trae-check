# README Accuracy Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the README with documentation that describes the implemented TRAE desktop-credential workflow accurately.

**Architecture:** A single Markdown document provides an accurate overview, prerequisites, setup instructions, user workflow, data handling, limitations, developer commands, and repository structure. Claims are constrained to behavior present in the Electron main process and Vue UI.

**Tech Stack:** Markdown, Electron, Vue 3, pnpm

---

### Task 1: Rewrite the user documentation

**Files:**
- Modify: `README.md` (entire document)
- Test: `README.md` content inspection

- [x] **Step 1: Replace stale documentation with the implemented workflow**

Write sections for: overview; current functionality; prerequisites; pnpm setup; importing the current TRAE desktop account; manual, batch, and scheduled check-in; points and logs; local data and credential handling; limitations and troubleshooting; developer commands; project structure; and license.

State that importing reads the current Windows TRAE desktop login, credentials are protected with Electron `safeStorage`, and scheduling uses Asia/Shanghai time. Do not describe Cookie entry, packet capture, Webview, configurable API mode, or universal encryption.

- [x] **Step 2: Verify required statements**

Run: `Select-String -Path README.md -SimpleMatch -Pattern '导入当前 TRAE 桌面账号','Electron safeStorage','Asia/Shanghai','pnpm install','pnpm dev','pnpm build'`

Expected: every required statement is present.

- [x] **Step 3: Verify obsolete guidance is absent**

Run: `Select-String -Path README.md -Pattern 'Webview|webview|Cookie|cookie|抓包|API 模式'`

Expected: no output.

- [x] **Step 4: Review Markdown formatting and scope**

Run: `git diff --check; git diff -- README.md`

Expected: no whitespace errors and only `README.md` changes.

- [x] **Step 5: Commit the rewritten README**

```bash
git add README.md
git commit -m "docs: align README with desktop workflow"
```
