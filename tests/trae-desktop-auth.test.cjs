const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  decryptTraeAuthInfo,
  getTraeDesktopCredentials,
  setTraeDesktopCredentials
} = require('../electron/trae-auth.cjs')

const LEFT_SECRET = Buffer.from([82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37])
const RIGHT_SECRET = Buffer.from([31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125])

function encryptFixture(value) {
  const randomKey = Buffer.alloc(32, 7)
  const secret = Buffer.from(LEFT_SECRET.map((byte, index) => byte ^ RIGHT_SECRET[index]))
  const firstDigest = crypto.createHash('sha512').update(randomKey).digest()
  const material = Buffer.concat([firstDigest, secret])
  const derived = crypto.createHash('sha512').update(material).digest()
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  const signedPayload = Buffer.concat([crypto.createHash('sha512').update(payload).digest(), payload])
  const cipher = crypto.createCipheriv('aes-128-cbc', derived.subarray(0, 16), derived.subarray(16, 32))
  const encrypted = Buffer.concat([cipher.update(signedPayload), cipher.final()])
  return Buffer.concat([Buffer.from([116, 99, 5, 16, 0, 0]), randomKey, encrypted]).toString('base64')
}

test('decrypts the TRAE desktop credential envelope and returns its JSON payload', () => {
  const expected = { token: 'desktop-token-for-test', userId: '42' }

  assert.deepEqual(decryptTraeAuthInfo(encryptFixture(expected)), expected)
})

test('rejects a credential envelope whose integrity digest is invalid', () => {
  const encrypted = Buffer.from(encryptFixture({ token: 'desktop-token-for-test' }), 'base64')
  encrypted[38] ^= 1

  assert.throws(() => decryptTraeAuthInfo(encrypted.toString('base64')), /integrity/i)
})

test('preserves the complete desktop session and only replaces its selected signing key', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-desktop-auth-'))
  const storageDir = path.join(appData, 'TRAE SOLO CN', 'User', 'globalStorage')
  const storagePath = path.join(storageDir, 'storage.json')
  const authInfo = {
    token: 'desktop-token-for-test',
    refreshToken: 'desktop-refresh-token',
    expiredAt: '2030-01-02T03:04:05.000Z',
    refreshExpiredAt: '2030-02-03T04:05:06.000Z',
    tokenReleaseAt: '2030-01-01T03:04:05.000Z',
    userId: '42',
    userRegion: 'cn',
    host: 'https://example.test',
    account: { username: 'alice', email: 'alice@example.test', roles: ['member'] }
  }
  const selectedKey = { privateKeyPEM: 'private-selected', publicKeyPEM: 'public-selected', keyVersion: 2 }
  const otherKey = { privateKeyPEM: 'private-other', publicKeyPEM: 'public-other' }
  const storage = {
    'iCubeAuthInfo://icube.cloudide': encryptFixture(authInfo),
    'iCubeAuthInfo://icube-dc:42': encryptFixture(selectedKey),
    'iCubeAuthInfo://icube-dc:99': encryptFixture(otherKey),
    'telemetry.devDeviceId': 'device-1',
    'telemetry.machineId': 'machine-1',
    unrelatedSetting: { keeps: 'value' }
  }

  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(storagePath, JSON.stringify(storage), 'utf8')

  try {
    const credential = getTraeDesktopCredentials(appData)
    assert.deepEqual(credential.authInfo, authInfo)
    assert.deepEqual(credential.signingKeyEntry, {
      key: 'iCubeAuthInfo://icube-dc:42',
      value: storage['iCubeAuthInfo://icube-dc:42']
    })
    assert.deepEqual(credential.signingKeyEntries, [
      { key: 'iCubeAuthInfo://icube-dc:42', value: storage['iCubeAuthInfo://icube-dc:42'] },
      { key: 'iCubeAuthInfo://icube-dc:99', value: storage['iCubeAuthInfo://icube-dc:99'] }
    ])

    setTraeDesktopCredentials(credential, appData)

    const restored = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
    assert.deepEqual(decryptTraeAuthInfo(restored['iCubeAuthInfo://icube.cloudide']), authInfo)
    assert.deepEqual(decryptTraeAuthInfo(restored['iCubeAuthInfo://icube-dc:42']), selectedKey)
    assert.equal(restored['iCubeAuthInfo://icube-dc:99'], storage['iCubeAuthInfo://icube-dc:99'])
    assert.deepEqual(restored.unrelatedSetting, storage.unrelatedSetting)
  } finally {
    fs.rmSync(appData, { recursive: true, force: true })
  }
})

test('restores the backup when post-write validation fails', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-desktop-auth-'))
  const storageDir = path.join(appData, 'TRAE SOLO CN', 'User', 'globalStorage')
  const storagePath = path.join(storageDir, 'storage.json')
  const storage = {
    'iCubeAuthInfo://icube.cloudide': encryptFixture({
      token: 'desktop-token-for-test', refreshToken: 'refresh-token', expiredAt: '2030-01-02T03:04:05.000Z',
      refreshExpiredAt: '2030-02-03T04:05:06.000Z', userId: '42', account: { username: 'alice' }, host: 'https://example.test'
    }),
    'iCubeAuthInfo://icube-dc:42': encryptFixture({ privateKeyPEM: 'private', publicKeyPEM: 'public' }),
    'telemetry.devDeviceId': 'device-1',
    'telemetry.machineId': 'machine-1'
  }
  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(storagePath, JSON.stringify(storage), 'utf8')
  const original = fs.readFileSync(storagePath, 'utf8')

  try {
    const credential = getTraeDesktopCredentials(appData)
    credential.signingKeyEntries = [{ ...credential.signingKeyEntries[0], value: 'not-an-encrypted-envelope' }]
    credential.signingKeyEntry = credential.signingKeyEntries[0]

    assert.throws(() => setTraeDesktopCredentials(credential, appData), /original local session was restored/i)
    assert.equal(fs.readFileSync(storagePath, 'utf8'), original)
  } finally {
    fs.rmSync(appData, { recursive: true, force: true })
  }
})

test('writes refreshed credentials into the preserved auth payload', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-desktop-auth-'))
  const storageDir = path.join(appData, 'TRAE SOLO CN', 'User', 'globalStorage')
  const storagePath = path.join(storageDir, 'storage.json')
  const authInfo = {
    token: 'old-token', refreshToken: 'old-refresh-token', expiredAt: '2030-01-02T03:04:05.000Z',
    refreshExpiredAt: '2030-02-03T04:05:06.000Z', userId: '42', account: { username: 'alice' }, host: 'https://example.test', userRegion: 'cn'
  }
  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(storagePath, JSON.stringify({
    'iCubeAuthInfo://icube.cloudide': encryptFixture(authInfo),
    'iCubeAuthInfo://icube-dc:42': encryptFixture({ privateKeyPEM: 'private', publicKeyPEM: 'public' }),
    'telemetry.devDeviceId': 'device-1',
    'telemetry.machineId': 'machine-1'
  }), 'utf8')

  try {
    const credential = getTraeDesktopCredentials(appData)
    credential.token = 'new-token'
    credential.refreshToken = 'new-refresh-token'
    credential.expiresAt = Date.parse('2031-01-02T03:04:05.000Z')
    credential.refreshExpiresAt = Date.parse('2031-02-03T04:05:06.000Z')
    setTraeDesktopCredentials(credential, appData)

    const written = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
    assert.deepEqual(decryptTraeAuthInfo(written['iCubeAuthInfo://icube.cloudide']), {
      ...authInfo,
      token: 'new-token',
      refreshToken: 'new-refresh-token',
      expiredAt: '2031-01-02T03:04:05.000Z',
      refreshExpiredAt: '2031-02-03T04:05:06.000Z'
    })
  } finally {
    fs.rmSync(appData, { recursive: true, force: true })
  }
})

test('imports every available desktop signing key even when key suffixes do not match the user ID', () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-desktop-auth-'))
  const storageDir = path.join(appData, 'TRAE SOLO CN', 'User', 'globalStorage')
  const authInfo = {
    token: 'desktop-token-for-test', refreshToken: 'refresh-token', expiredAt: '2030-01-02T03:04:05.000Z',
    refreshExpiredAt: '2030-02-03T04:05:06.000Z', userId: '42', account: { username: 'alice' }, host: 'https://example.test'
  }
  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(path.join(storageDir, 'storage.json'), JSON.stringify({
    'iCubeAuthInfo://icube.cloudide': encryptFixture(authInfo),
    'iCubeAuthInfo://icube-dc:99': encryptFixture({ privateKeyPEM: 'private-other', publicKeyPEM: 'public-other' }),
    'telemetry.devDeviceId': 'device-1',
    'telemetry.machineId': 'machine-1'
  }), 'utf8')

  try {
    const credential = getTraeDesktopCredentials(appData)
    assert.deepEqual(credential.signingKeyEntries, [
      { key: 'iCubeAuthInfo://icube-dc:99', value: JSON.parse(fs.readFileSync(path.join(storageDir, 'storage.json'), 'utf8'))['iCubeAuthInfo://icube-dc:99'] }
    ])
    assert.equal(credential.signingKeyEntry.key, 'iCubeAuthInfo://icube-dc:99')
  } finally {
    fs.rmSync(appData, { recursive: true, force: true })
  }
})
