const assert = require('node:assert/strict')
const test = require('node:test')

const { refreshCredential } = require('../electron/desktop-credentials.cjs')

test('refreshes a desktop credential through the signed TRAE exchange request', async () => {
  const credential = {
    token: 'old-token', refreshToken: 'refresh-token', expiresAt: 1, refreshExpiresAt: 9_999_999_999_999,
    deviceId: 'device', machineId: 'machine', privateKeyPEM: 'private', publicKeyPEM: 'public', userId: 'u', accountName: 'a', host: 'https://api.trae.cn',
    authInfo: {
      userId: 'u', token: 'old-token', refreshToken: 'refresh-token', expiredAt: 'old-expiry', refreshExpiredAt: 'old-refresh-expiry', host: 'https://api.trae.cn',
      account: { username: 'a' }, sessionMarker: 'preserve-me'
    },
    signingKeyEntry: { key: 'iCubeAuthInfo://icube-dc:u', value: 'signing-key' },
    signingKeyEntries: [{ key: 'iCubeAuthInfo://icube-dc:u', value: 'signing-key' }]
  }
  let request
  const result = await refreshCredential(credential, {
    now: () => 1_700_000_000_000,
    sign: () => 'signature',
    post: async (url, body, options) => {
      request = { url, body, options }
      return { data: { Result: { Token: 'new-token', RefreshToken: 'new-refresh', TokenExpireAt: 1_700_001_000_000, RefreshExpireAt: '2024-01-02T00:00:00.000Z' } } }
    }
  })

  assert.equal(request.url, 'https://api.trae.cn/trae/api/v3/oauth/ExchangeToken')
  assert.equal(request.body.RefreshToken, 'refresh-token')
  assert.equal(request.options.headers['x-cloudide-token'], 'old-token')
  assert.equal(result.token, 'new-token')
  assert.equal(result.refreshToken, 'new-refresh')
  assert.deepEqual(result.authInfo, {
    userId: 'u', token: 'new-token', refreshToken: 'new-refresh', expiredAt: '1700001000000', refreshExpiredAt: '2024-01-02T00:00:00.000Z', host: 'https://api.trae.cn',
    account: { username: 'a' }, sessionMarker: 'preserve-me'
  })
})
