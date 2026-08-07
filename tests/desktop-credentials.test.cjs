const assert = require('node:assert/strict')
const test = require('node:test')

const { encryptCredential, decryptCredential, publicCredentialStatus, upsertDesktopAccount, legacyCredentialReimportMessage } = require('../electron/desktop-credentials.cjs')

const fakeSafeStorage = {
  encryptString(value) { return Buffer.from(`encrypted:${value}`) },
  decryptString(value) {
    const text = Buffer.from(value).toString('utf8')
    if (!text.startsWith('encrypted:')) throw new Error('invalid encrypted value')
    return text.slice('encrypted:'.length)
  }
}

const credential = {
  token: 'access-secret',
  refreshToken: 'refresh-secret',
  expiresAt: 4_102_444_800_000,
  refreshExpiresAt: 4_105_598_400_000,
  deviceId: 'device-1',
  machineId: 'machine-1',
  privateKeyPEM: 'private-secret',
  publicKeyPEM: 'public-key',
  userId: 'user-1',
  accountName: '测试账号',
  host: 'https://api.trae.cn',
  authInfo: {
    userId: 'user-1',
    token: 'access-secret',
    refreshToken: 'refresh-secret',
    expiredAt: '2100-01-01T00:00:00.000Z',
    refreshExpiredAt: '2100-02-01T00:00:00.000Z',
    host: 'https://api.trae.cn',
    account: { username: '测试账号' }
  },
  signingKeyEntry: {
    key: 'iCubeAuthInfo://icube-dc:user-1',
    value: 'signing-key-secret'
  },
  signingKeyEntries: [{
    key: 'iCubeAuthInfo://icube-dc:user-1',
    value: 'signing-key-secret'
  }]
}

test('round-trips one desktop credential without exposing secrets in public status', () => {
  const encoded = encryptCredential(credential, fakeSafeStorage)

  assert.deepEqual(decryptCredential(encoded, fakeSafeStorage), { payload: credential, decryptionFailed: false })
  assert.deepEqual(publicCredentialStatus(credential, 4_102_000_000_000), { type: 'desktop', credentialStatus: 'valid' })
  assert.doesNotMatch(JSON.stringify(publicCredentialStatus(credential)), /secret|private|token|authinfo|signingkey/i)
})

test('rejects an incomplete legacy credential that cannot restore the TRAE session', () => {
  const legacyCredential = { ...credential }
  delete legacyCredential.authInfo
  delete legacyCredential.signingKeyEntry

  assert.throws(() => encryptCredential(legacyCredential, fakeSafeStorage), /Invalid TRAE desktop credential/)
})

test('reports a persisted old credential as a legacy credential instead of a decryption failure', () => {
  const legacyCredential = { ...credential }
  delete legacyCredential.authInfo
  delete legacyCredential.signingKeyEntry
  const encoded = fakeSafeStorage.encryptString(JSON.stringify(legacyCredential)).toString('base64')

  assert.deepEqual(decryptCredential(encoded, fakeSafeStorage), { payload: null, decryptionFailed: false, legacyCredential: true })
})

test('provides a clear re-import message for legacy credentials', () => {
  assert.equal(legacyCredentialReimportMessage(), '此账号由旧版本导入，缺少完整桌面会话；请在 TRAE 登录该账号后重新导入，再设为本地。')
})

test('rejects auth info that lacks the fields needed to restore a TRAE session', () => {
  const incompleteAuthInfo = { ...credential, authInfo: { userId: credential.userId, token: 'access-secret' } }

  assert.throws(() => encryptCredential(incompleteAuthInfo, fakeSafeStorage), /Invalid TRAE desktop credential auth info/)
})

test('marks an expired credential without attempting to expose its contents', () => {
  assert.deepEqual(publicCredentialStatus(credential, credential.expiresAt + 1), { type: 'desktop', credentialStatus: 'expired' })
})

test('updates an existing account with the same TRAE user ID instead of adding a duplicate', () => {
  const accounts = [{ id: 'existing', desktopUserId: 'user-1', name: '旧名称', encryptedCredential: 'old', enabled: true }]
  const result = upsertDesktopAccount(accounts, { id: 'new-id', name: '测试账号', desktopUserId: 'user-1', encryptedCredential: 'new', enabled: true })

  assert.equal(result.length, 1)
  assert.deepEqual(result[0], { id: 'existing', name: '测试账号', desktopUserId: 'user-1', encryptedCredential: 'new', enabled: true })
})
