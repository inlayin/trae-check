# TRAE Desktop Multi-Account Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import each TRAE desktop account once, then check in all saved accounts without switching the TRAE client.

**Architecture:** Keep encrypted credentials in the main-process store only. A focused credential module imports the active TRAE client session, encrypts/decrypts per-account credentials with Electron `safeStorage`, refreshes expired access tokens, and provides sanitized account metadata. The check-in service receives one account's credential, while IPC and the Vue UI expose import/status operations without exposing secrets.

**Tech Stack:** Electron 29, TypeScript, Vue 3, Pinia, electron-store, Axios, Node test runner.

---

### Task 1: Define desktop-account credential types and encryption boundary

**Files:**
- Modify: `electron/types.ts`
- Create: `electron/desktop-credentials.ts`
- Create: `tests/desktop-credentials.test.cjs`

- [ ] **Step 1: Write failing tests for encrypted round-trip and sanitized metadata**

```js
const { encryptCredential, decryptCredential, publicCredentialStatus } = require('../electron/desktop-credentials.cjs')

test('round-trips one desktop credential without exposing its token in public status', () => {
  const credential = { token: 'access-secret', refreshToken: 'refresh-secret', expiresAt: 4102444800000, deviceId: 'device-1', userId: 'user-1', accountName: '测试账号' }
  const encoded = encryptCredential(credential, fakeSafeStorage)
  assert.deepEqual(decryptCredential(encoded, fakeSafeStorage), credential)
  assert.deepEqual(publicCredentialStatus(credential, 4102440000000), { type: 'desktop', credentialStatus: 'valid' })
  assert.doesNotMatch(JSON.stringify(publicCredentialStatus(credential)), /secret/)
})
```

- [ ] **Step 2: Run the new test and verify it fails because the module is absent**

Run: `node --test tests/desktop-credentials.test.cjs`

Expected: failure containing `Cannot find module`.

- [ ] **Step 3: Add the desktop credential type and main-process encryption module**

```ts
export interface DesktopCredential {
  token: string
  refreshToken: string
  expiresAt: number
  deviceId: string
  userId: string
  accountName: string
}

export function encryptCredential(value: DesktopCredential, safeStorage: Electron.SafeStorage): string {
  return safeStorage.encryptString(JSON.stringify(value)).toString('base64')
}
```

Implement the inverse with `safeStorage.decryptString`, validate every required string field, and expose a status function that returns only `type` and `credentialStatus` (`valid`, `expiring`, or `expired`). Do not log payloads.

- [ ] **Step 4: Run the credential tests and verify they pass**

Run: `node --test tests/desktop-credentials.test.cjs`

Expected: all subtests pass.

- [ ] **Step 5: Commit if a Git repository is initialized**

This workspace currently has no `.git` directory. Do not initialize one; record the changed files instead.

### Task 2: Import and deduplicate the active TRAE desktop account

**Files:**
- Modify: `electron/trae-auth.cjs`
- Modify: `electron/store.ts`
- Modify: `electron/ipc.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/types.ts`
- Test: `tests/desktop-credentials.test.cjs`

- [ ] **Step 1: Write failing tests for imported user identity and duplicate replacement**

```js
test('updates the existing account when the imported TRAE user ID already exists', () => {
  const accounts = [{ id: 'a', desktopUserId: 'u1', name: '旧名称', encryptedCredential: 'old' }]
  const next = upsertImportedDesktopAccount(accounts, importedCredential('u1', '新名称'))
  assert.equal(next.length, 1)
  assert.equal(next[0].name, '新名称')
  assert.equal(next[0].encryptedCredential, 'new')
})
```

- [ ] **Step 2: Run the test and verify it fails because import/upsert behavior is absent**

Run: `node --test tests/desktop-credentials.test.cjs`

Expected: failure naming the missing import/upsert function.

- [ ] **Step 3: Implement credential import and IPC**

Extend `getTraeDesktopCredentials` to return the decrypted current auth record including `refreshToken`, user ID, display name and device ID. Add a store upsert keyed by `desktopUserId`; save only encrypted credentials. Add `accounts:import-desktop` IPC and a preload method returning sanitized account data. The renderer must never receive `token` or `refreshToken`.

- [ ] **Step 4: Run import tests and existing tests**

Run: `node --test tests/desktop-credentials.test.cjs tests/trae-desktop-auth.test.cjs tests/login-window-preload.test.cjs tests/checkin-selector.test.cjs`

Expected: all tests pass.

- [ ] **Step 5: Commit if a Git repository is initialized**

This workspace currently has no `.git` directory. Do not initialize one.

### Task 3: Refresh saved credentials and use one account's credentials for check-in

**Files:**
- Modify: `electron/desktop-credentials.ts`
- Modify: `electron/checkin.ts`
- Modify: `electron/store.ts`
- Create: `tests/checkin-desktop-account.test.cjs`

- [ ] **Step 1: Write failing tests for normalized success text and per-account authorization**

```js
test('normalizes the official success message', () => {
  assert.equal(normalizeCheckinMessage('success', true), '签到成功')
})

test('builds authorization from the credential passed for that account', () => {
  assert.deepEqual(buildCheckinHeaders({ token: 'token-a', deviceId: 'device-a' }), {
    'Content-Type': 'application/json',
    Authorization: 'Cloud-IDE-JWT token-a',
    'x-device-id': 'device-a'
  })
})
```

- [ ] **Step 2: Run the test and verify it fails because helper exports are absent**

Run: `node --test tests/checkin-desktop-account.test.cjs`

Expected: failure naming the missing helpers.

- [ ] **Step 3: Implement refresh and account-scoped check-in**

Use the documented TRAE desktop refresh flow discovered from the installed client to exchange `refreshToken` before expiry or after an authentication failure. Persist the newly encrypted credential through `updateAccount`. Change `performCheckin(account)` to decrypt and use that account's credential; do not read the current TRAE account during check-in. Treat refresh failure as `凭证已失效，请重新导入`, while preserving processing of subsequent accounts. Normalize an official `success` message to `签到成功`.

- [ ] **Step 4: Run check-in tests without calling the real claim endpoint**

Run: `node --test tests/checkin-desktop-account.test.cjs tests/desktop-credentials.test.cjs tests/trae-desktop-auth.test.cjs`

Expected: all tests pass with mocked HTTP transport only.

- [ ] **Step 5: Commit if a Git repository is initialized**

This workspace currently has no `.git` directory. Do not initialize one.

### Task 4: Replace Cookie-oriented account import UI

**Files:**
- Modify: `src/components/AddAccountModal.vue`
- Modify: `src/stores/app.ts`
- Modify: `src/env.d.ts`
- Modify: `src/components/AccountCard.vue`
- Create: `tests/desktop-import-ui.test.cjs`

- [ ] **Step 1: Write a failing static UI contract test**

```js
test('add account modal imports the current TRAE desktop account', () => {
  const source = fs.readFileSync('src/components/AddAccountModal.vue', 'utf8')
  assert.match(source, /导入当前 TRAE 桌面账号/)
  assert.match(source, /importDesktopAccount/)
  assert.doesNotMatch(source, /粘贴从浏览器开发者工具中复制的完整 Cookie/)
})
```

- [ ] **Step 2: Run the test and verify it fails on the current Cookie-only modal**

Run: `node --test tests/desktop-import-ui.test.cjs`

Expected: assertion failure for the missing import action.

- [ ] **Step 3: Implement the import flow and public status display**

Replace the default Cookie text area and login-window action with an import button. Wire it to the preload IPC method and refresh Pinia accounts on success. Show only public credential status on account cards. Keep legacy Cookie account records readable but label them as needing desktop-account re-import.

- [ ] **Step 4: Run the UI contract test**

Run: `node --test tests/desktop-import-ui.test.cjs`

Expected: all subtests pass.

### Task 5: Simplify settings and complete verification

**Files:**
- Modify: `src/components/SettingsPanel.vue`
- Modify: `electron/types.ts`
- Modify: `src/stores/app.ts`
- Create: `tests/settings-desktop-mode.test.cjs`

- [ ] **Step 1: Write a failing settings-page contract test**

```js
test('settings describes TRAE desktop account import instead of Cookie/Webview modes', () => {
  const source = fs.readFileSync('src/components/SettingsPanel.vue', 'utf8')
  assert.match(source, /TRAE 桌面接口签到/)
  assert.match(source, /凭证失效/)
  assert.doesNotMatch(source, /Webview 模式/)
  assert.doesNotMatch(source, /Cookie 会自动从账号配置中注入/)
})
```

- [ ] **Step 2: Run the test and verify it fails on existing settings content**

Run: `node --test tests/settings-desktop-mode.test.cjs`

Expected: assertion failure for the missing desktop interface guidance.

- [ ] **Step 3: Remove obsolete mode settings and update help text**

Remove `checkinMode` and `apiConfig` from renderer-visible settings and make the desktop API the only normal check-in path. Update settings help to state: import every account once, automatic scheduling requires the app to run, and an expired refresh credential requires re-import.

- [ ] **Step 4: Run all tests and a fresh production build**

Run: `node --test tests/*.test.cjs; pnpm exec vite build`

Expected: all tests pass and Vite exits with code 0.

- [ ] **Step 5: Perform one read-only status check using an imported account**

Run a local test harness against the official status endpoint only. Do not send the claim request. Confirm only sanitized fields (`code`, `checked_in`, `enable`) appear in output.

- [ ] **Step 6: Commit if a Git repository is initialized**

This workspace currently has no `.git` directory. Do not initialize one.
