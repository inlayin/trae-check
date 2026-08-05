const assert = require('node:assert/strict')
const test = require('node:test')

const { encryptCredential, decryptCredential, publicCredentialStatus, upsertDesktopAccount } = require('../electron/desktop-credentials.cjs')

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
  host: 'https://api.trae.cn'
}

test('round-trips one desktop credential without exposing secrets in public status', () => {
  const encoded = encryptCredential(credential, fakeSafeStorage)

  assert.deepEqual(decryptCredential(encoded, fakeSafeStorage), credential)
  assert.deepEqual(publicCredentialStatus(credential, 4_102_000_000_000), { type: 'desktop', credentialStatus: 'valid' })
  assert.doesNotMatch(JSON.stringify(publicCredentialStatus(credential)), /secret|private|token/i)
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
