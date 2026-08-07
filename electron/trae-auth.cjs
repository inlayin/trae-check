const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const HEADER = Buffer.from([116, 99, 5, 16, 0, 0])
const LEFT_SECRET = Buffer.from([82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37])
const RIGHT_SECRET = Buffer.from([31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125])

function sha512(value) {
  return crypto.createHash('sha512').update(value).digest()
}

function decryptTraeAuthInfo(encoded) {
  const envelope = Buffer.from(encoded, 'base64')
  if (envelope.length <= 38 || !envelope.subarray(0, 6).equals(HEADER)) {
    throw new Error('Invalid TRAE desktop credential envelope')
  }

  const randomKey = envelope.subarray(6, 38)
  const secret = Buffer.from(LEFT_SECRET.map((byte, index) => byte ^ RIGHT_SECRET[index]))
  const derived = sha512(Buffer.concat([sha512(randomKey), secret]))
  const decipher = crypto.createDecipheriv('aes-128-cbc', derived.subarray(0, 16), derived.subarray(16, 32))
  const plaintext = Buffer.concat([decipher.update(envelope.subarray(38)), decipher.final()])
  const expectedDigest = plaintext.subarray(0, 64)
  const payload = plaintext.subarray(64)

  if (expectedDigest.length !== 64 || !crypto.timingSafeEqual(expectedDigest, sha512(payload))) {
    throw new Error('TRAE desktop credential integrity check failed')
  }

  return JSON.parse(payload.toString('utf8'))
}

function getTraeDesktopCredentials(appData = process.env.APPDATA) {
  if (!appData) throw new Error('Windows AppData directory is unavailable')

  const storagePath = path.join(appData, 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json')
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
  const encrypted = storage['iCubeAuthInfo://icube.cloudide']
  if (typeof encrypted !== 'string') throw new Error('TRAE desktop login information was not found')

  const authInfo = decryptTraeAuthInfo(encrypted)
  if (typeof authInfo.token !== 'string' || !authInfo.token) throw new Error('TRAE desktop login token is invalid')
  const deviceId = storage['telemetry.devDeviceId']
  const machineId = storage['telemetry.machineId']
  if (typeof deviceId !== 'string' || !deviceId) throw new Error('TRAE desktop device ID is unavailable')
  if (typeof machineId !== 'string' || !machineId) throw new Error('TRAE desktop machine ID is unavailable')
  const dcPrefix = 'iCubeAuthInfo://icube-dc:'
  const signingKeyEntries = Object.entries(storage)
    .filter(([key, value]) => key.startsWith(dcPrefix) && typeof value === 'string')
    .map(([key, value]) => ({ key, value }))
  const signingKeyEntry = signingKeyEntries[0]
  if (!signingKeyEntry) throw new Error('TRAE desktop signing key is unavailable')
  const signingKey = decryptTraeAuthInfo(signingKeyEntry.value)
  if (typeof signingKey.privateKeyPEM !== 'string' || typeof signingKey.publicKeyPEM !== 'string') throw new Error('TRAE desktop signing key is invalid')
  const expiresAt = Date.parse(authInfo.expiredAt)
  const refreshExpiresAt = Date.parse(authInfo.refreshExpiredAt)
  if (!Number.isFinite(expiresAt) || !Number.isFinite(refreshExpiresAt)) throw new Error('TRAE desktop credential expiry is invalid')
  return {
    token: authInfo.token,
    refreshToken: authInfo.refreshToken,
    expiresAt,
    refreshExpiresAt,
    deviceId,
    machineId,
    privateKeyPEM: signingKey.privateKeyPEM,
    publicKeyPEM: signingKey.publicKeyPEM,
    userId: authInfo.userId,
    accountName: authInfo.account?.username || `TRAE 用户 ${authInfo.userId}`,
    host: authInfo.host,
    authInfo,
    signingKeyEntry,
    signingKeyEntries
  }
}

function getTraeDesktopToken(appData) {
  return getTraeDesktopCredentials(appData).token
}

/**
 * 把 authInfo payload 重新加密为 TRAE 桌面客户端的 envelope 格式（HEADER + randomKey + AES-128-CBC(SHA512(payload)+payload)）。
 * 与 decryptTraeAuthInfo 互为逆运算。
 */
function encryptTraeAuthInfo(payload) {
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const digest = sha512(payloadBuf)
  const plaintext = Buffer.concat([digest, payloadBuf])
  const randomKey = crypto.randomBytes(32)
  const secret = Buffer.from(LEFT_SECRET.map((byte, index) => byte ^ RIGHT_SECRET[index]))
  const derived = sha512(Buffer.concat([sha512(randomKey), secret]))
  const cipher = crypto.createCipheriv('aes-128-cbc', derived.subarray(0, 16), derived.subarray(16, 32))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([HEADER, randomKey, ciphertext]).toString('base64')
}

/**
 * 把指定 credential 写回 TRAE 桌面客户端的 storage.json，使桌面客户端切换到该账号登录态。
 * 流程：备份原文件 → 读取 → 替换 authInfo 与签名密钥条目 → 原子写入（临时文件 + rename）。
 * 返回 { backupPath, wroteKeys }。
 */
function setTraeDesktopCredentials(credential, appData = process.env.APPDATA) {
  if (!appData) throw new Error('Windows AppData directory is unavailable')
  const storagePath = path.join(appData, 'TRAE SOLO CN', 'User', 'globalStorage', 'storage.json')
  if (!credential?.authInfo || typeof credential.authInfo !== 'object' || Array.isArray(credential.authInfo)) {
    throw new Error('TRAE desktop credential is missing its complete local session')
  }
  const signingKeyEntries = credential.signingKeyEntries
  if (!Array.isArray(signingKeyEntries) || signingKeyEntries.length === 0 || signingKeyEntries.some((entry) => !entry || typeof entry.key !== 'string' || !entry.key.startsWith('iCubeAuthInfo://icube-dc:') || typeof entry.value !== 'string')) {
    throw new Error('TRAE desktop credential is missing its local signing key')
  }
  if (!fs.existsSync(storagePath)) throw new Error('TRAE 桌面客户端 storage.json 不存在：' + storagePath)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${storagePath}.trae-check.bak.${timestamp}`
  const tmpPath = `${storagePath}.trae-check.tmp`
  fs.copyFileSync(storagePath, backupPath)

  try {
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'))

  const authInfo = {
    ...credential.authInfo,
    token: credential.token,
    refreshToken: credential.refreshToken,
    expiredAt: new Date(credential.expiresAt).toISOString(),
    refreshExpiredAt: new Date(credential.refreshExpiresAt).toISOString()
  }
  storage['iCubeAuthInfo://icube.cloudide'] = encryptTraeAuthInfo(authInfo)

  // Restore every signing-key entry captured with this desktop session.
  for (const entry of signingKeyEntries) storage[entry.key] = entry.value

  // 原子写入：先写临时文件再 rename，避免写入中途崩溃损坏原文件
  fs.writeFileSync(tmpPath, JSON.stringify(storage, null, 2), 'utf8')
  fs.renameSync(tmpPath, storagePath)

  const written = JSON.parse(fs.readFileSync(storagePath, 'utf8'))
  assert.deepStrictEqual(decryptTraeAuthInfo(written['iCubeAuthInfo://icube.cloudide']), authInfo)
  for (const entry of signingKeyEntries) {
    assert.deepStrictEqual(decryptTraeAuthInfo(written[entry.key]), decryptTraeAuthInfo(entry.value))
  }

  return { backupPath, wroteKeys: ['iCubeAuthInfo://icube.cloudide', ...signingKeyEntries.map((entry) => entry.key)] }
  } catch (error) {
    try {
      fs.copyFileSync(backupPath, storagePath)
    } catch (restoreError) {
      throw new Error(`TRAE desktop credential write failed and the original local session could not be restored: ${restoreError.message}`)
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    }
    throw new Error(`TRAE desktop credential write failed; the original local session was restored: ${error.message}`)
  }
}

module.exports = { decryptTraeAuthInfo, getTraeDesktopCredentials, getTraeDesktopToken, encryptTraeAuthInfo, setTraeDesktopCredentials }
