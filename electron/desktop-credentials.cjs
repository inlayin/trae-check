function assertCredential(value) {
  const required = ['token', 'refreshToken', 'deviceId', 'machineId', 'privateKeyPEM', 'publicKeyPEM', 'userId', 'accountName', 'host']
  if (!value || typeof value !== 'object' || required.some((key) => typeof value[key] !== 'string' || !value[key])) {
    throw new Error('Invalid TRAE desktop credential')
  }
  if (!Number.isFinite(value.expiresAt) || !Number.isFinite(value.refreshExpiresAt)) {
    throw new Error('Invalid TRAE desktop credential expiry')
  }
  return value
}

function encryptCredential(value, safeStorage) {
  return safeStorage.encryptString(JSON.stringify(assertCredential(value))).toString('base64')
}

function decryptCredential(value, safeStorage) {
  return assertCredential(JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64'))))
}

function publicCredentialStatus(value, now = Date.now()) {
  assertCredential(value)
  if (value.expiresAt <= now) return { type: 'desktop', credentialStatus: 'expired' }
  if (value.expiresAt - now <= 15 * 60 * 1000) return { type: 'desktop', credentialStatus: 'expiring' }
  return { type: 'desktop', credentialStatus: 'valid' }
}

function upsertDesktopAccount(accounts, incoming) {
  const index = accounts.findIndex((account) => account.desktopUserId === incoming.desktopUserId)
  if (index < 0) return [...accounts, incoming]
  const next = [...accounts]
  next[index] = { ...next[index], ...incoming, id: next[index].id }
  return next
}

async function refreshCredential(credential, dependencies = {}) {
  assertCredential(credential)
  const crypto = dependencies.crypto || require('node:crypto')
  const os = dependencies.os || require('node:os')
  const post = dependencies.post || require('axios').post
  const now = dependencies.now || Date.now
  const timestamp = Math.floor(now() / 1000)
  const nonce = crypto.randomBytes ? crypto.randomBytes(16).toString('hex') : 'test-nonce'
  const clientId = 'en1oxy7wnw8j9n'
  const requestPath = '/trae/api/v3/oauth/ExchangeToken'
  const signaturePayload = ['POST', requestPath, clientId, credential.refreshToken, String(timestamp), nonce].join('\n')
  const signature = dependencies.sign ? dependencies.sign(signaturePayload, credential.privateKeyPEM) : crypto.sign('sha256', Buffer.from(signaturePayload), credential.privateKeyPEM).toString('base64')
  const body = {
    ClientID: clientId,
    ClientSecret: '',
    RefreshToken: credential.refreshToken,
    DeviceInfo: {
      DeviceID: credential.deviceId,
      MachineID: credential.machineId,
      PlatformCode: 'SOLO_PC',
      DeviceType: 'PC',
      DeviceName: os.userInfo().username,
      DeviceModel: '',
      ClientVersion: '0.1.43',
      DevicePublicKey: credential.publicKeyPEM,
      DeviceBrand: '',
      DeviceCPU: '',
      OSInfo: os.type(),
      OSVersion: os.release()
    },
    DeviceProof: { Signature: signature, Timestamp: timestamp, Nonce: nonce },
    IDEVersion: '0.1.43'
  }
  const response = await post(`${credential.host}${requestPath}`, body, { headers: { 'Content-Type': 'application/json', 'x-cloudide-token': credential.token }, timeout: 60000 })
  const data = response?.data?.Result
  if (!data?.Token || !data?.RefreshToken) throw new Error('TRAE credential refresh failed')
  const expiresAt = Number(data.TokenExpireAt)
  const refreshExpiresAt = Date.parse(data.RefreshExpireAt)
  if (!Number.isFinite(expiresAt) || !Number.isFinite(refreshExpiresAt)) throw new Error('TRAE credential refresh returned invalid expiry')
  return { ...credential, token: data.Token, refreshToken: data.RefreshToken, expiresAt, refreshExpiresAt }
}

module.exports = { encryptCredential, decryptCredential, publicCredentialStatus, upsertDesktopAccount, refreshCredential }
