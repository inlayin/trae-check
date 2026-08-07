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

// 判断 safeStorage 报错是否为跨机器/密钥变更类解密失败
function isDecryptionFailedError(e) {
  if (!e) return false
  const msg = (e.message || String(e)).toLowerCase()
  return msg.includes('decrypt') || msg.includes('ciphertext') || msg.includes('decryptstring')
}

// 解密凭证；跨机器/密钥失效时返回 { payload:null, decryptionFailed:true }。
function decryptCredential(value, safeStorage) {
  if (!value) return { payload: null, decryptionFailed: false }
  try {
    const plaintext = safeStorage.decryptString(Buffer.from(String(value), 'base64'))
    return { payload: assertCredential(JSON.parse(plaintext)), decryptionFailed: false }
  } catch (e) {
    return { payload: null, decryptionFailed: isDecryptionFailedError(e) }
  }
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

// ========== 密码加密导出/导入（方案 B） ==========
// 使用 PBKDF2 派生密钥 + AES-256-GCM 加解密，确保跨机器可迁移

const PBKDF2_ITERATIONS = 100000
const KEY_LENGTH = 32       // AES-256
const IV_LENGTH = 12        // GCM 标准
const SALT_LENGTH = 16

function encryptWithPassword(plaintext, password) {
  const crypto = require('node:crypto')
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // 打包格式：salt(16) + iv(12) + authTag(16) + ciphertext
  return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64')
}

function decryptWithPassword(base64Data, password) {
  const crypto = require('node:crypto')
  const buf = Buffer.from(base64Data, 'base64')
  if (buf.length < SALT_LENGTH + IV_LENGTH + 16) throw new Error('加密数据格式无效')
  const salt = buf.subarray(0, SALT_LENGTH)
  const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const authTag = buf.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + 16)
  const ciphertext = buf.subarray(SALT_LENGTH + IV_LENGTH + 16)
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

module.exports = { encryptCredential, decryptCredential, publicCredentialStatus, upsertDesktopAccount, refreshCredential, encryptWithPassword, decryptWithPassword }
