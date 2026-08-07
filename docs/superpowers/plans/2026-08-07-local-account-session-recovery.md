# Local Account Session Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make “Set as local account” restore a complete TRAE desktop session without forcing the user to log in again.

**Architecture:** Extend the encrypted desktop credential with the complete decrypted TRAE auth payload and the account-specific encrypted signing-key entries. The restore function replaces only those entries, verifies the written file by decrypting it again, and atomically rolls back from its backup if validation fails. Credentials imported before this change remain usable for check-in but must be re-imported before local switching because they lack the preserved payload.

**Tech Stack:** Electron main process, Node.js `fs` and `crypto`, Node built-in test runner.

---

### Task 1: Preserve and restore the full desktop session

**Files:**

- Modify: `electron/trae-auth.cjs`
- Test: `tests/trae-desktop-auth.test.cjs`

- [ ] **Step 1: Write the failing round-trip test**

Add a fixture storage document containing an auth payload with `tokenReleaseAt`, `userRegion`, and a full `account` object, plus multiple `iCubeAuthInfo://icube-dc:` entries. Assert that `getTraeDesktopCredentials(appData)` returns the complete `authInfo` and the selected signing-key entry, and that `setTraeDesktopCredentials(credential, appData)` leaves unrelated storage values and unrelated DC entries unchanged.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test tests/trae-desktop-auth.test.cjs`

Expected: FAIL because the extracted credential does not retain the full auth payload or DC entry.

- [ ] **Step 3: Implement the minimum complete-session preservation**

In `getTraeDesktopCredentials`, attach `authInfo` and the DC entry selected for the imported user to the returned credential. In `setTraeDesktopCredentials`, require those preserved values, encrypt the original `authInfo` object unchanged, replace only the selected DC entry, and do not delete any other DC keys.

- [ ] **Step 4: Add write verification and rollback**

After the atomic rename, decrypt the stored auth entry and selected key entry. Verify their deep equality to the intended payload. On any write or validation error, restore the backup with `fs.copyFileSync` and rethrow an error that says the original local session was restored.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `node --test tests/trae-desktop-auth.test.cjs`

Expected: PASS with the original envelope tests and the new complete-session round-trip test.

### Task 2: Keep encrypted credential validation compatible

**Files:**

- Modify: `electron/desktop-credentials.cjs`
- Test: `tests/desktop-credentials.test.cjs`

- [ ] **Step 1: Write a failing credential round-trip test**

Extend the credential fixture with `authInfo` and `signingKeyEntry`, then assert `encryptCredential` and `decryptCredential` round-trip both nested fields without making them appear in `publicCredentialStatus`.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `node --test tests/desktop-credentials.test.cjs`

Expected: FAIL because `assertCredential` currently ignores the session payload and signing-key entry requirements.

- [ ] **Step 3: Implement credential validation**

Require `authInfo` to be a non-null object with the imported session identity and require `signingKeyEntry` to have a DC key name and encrypted value. Keep these fields inside the `safeStorage` ciphertext and keep `publicCredentialStatus` unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/desktop-credentials.test.cjs`

Expected: PASS, with no credential plaintext in public status output.

### Task 3: Provide a safe migration message and validate the integrated build

**Files:**

- Modify: `electron/ipc.ts`
- Modify: `src/components/AccountList.vue`
- Test: `tests/trae-desktop-auth.test.cjs`

- [ ] **Step 1: Write the failing legacy-credential test**

Add a test that calls the restore path with a credential missing `authInfo` or `signingKeyEntry` and asserts it fails before writing the storage file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/trae-desktop-auth.test.cjs`

Expected: FAIL because the existing implementation synthesizes an incomplete session.

- [ ] **Step 3: Implement the migration guard**

Make `accounts:set-local` return a specific message for old credentials: “此账号由旧版本导入，缺少完整桌面会话；请在 TRAE 登录该账号后重新导入，再设为本地。” Display that message unchanged through the existing notification flow.

- [ ] **Step 4: Run all targeted tests and type-check**

Run: `node --test tests/trae-desktop-auth.test.cjs tests/desktop-credentials.test.cjs && pnpm exec vue-tsc --noEmit`

Expected: both test files pass and `vue-tsc` exits with code 0.

- [ ] **Step 5: Commit**

```powershell
git add electron/trae-auth.cjs electron/desktop-credentials.cjs electron/ipc.ts src/components/AccountList.vue tests/trae-desktop-auth.test.cjs tests/desktop-credentials.test.cjs
git commit -m "fix: restore complete TRAE local session"
```
